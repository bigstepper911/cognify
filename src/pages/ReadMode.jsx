import '@tensorflow/tfjs-backend-webgl';
import React, { useState, useEffect, useRef, useCallback } from 'react';
import Webcam from 'react-webcam';
import { AlertTriangle, ArrowLeft, BookOpenText, PlayCircle, Mic, Brain, ChevronRight, ChevronLeft, Volume2, VolumeX } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { generatePopQuiz, gradeAnswer, reframeContent, searchYouTube } from '../utils/gemini';
import * as blazeface from '@tensorflow-models/blazeface';
import { auth } from '../firebase';
import { loadUserData, saveFocusCoins } from '../utils/db';
import { useUser } from '../utils/UserContext';

const ReadMode = () => {
  const navigate = useNavigate();
  const webcamRef = useRef(null);
  const focusTimerRef = useRef(null);
  const modelRef = useRef(null);
  const intervalRef = useRef(null);
  const consecutiveAwayRef = useRef(0);

  const [focusCoins, setFocusCoins] = useState(0);
  const [isDistracted, setIsDistracted] = useState(false);
  const isDistractedRef = useRef(false);
  const [isVisionLoaded, setIsVisionLoaded] = useState(false);
  const [gazeStatus, setGazeStatus] = useState("loading");

  const paragraphs = JSON.parse(localStorage.getItem("cognify_paragraphs") || "[]");
  const [currentIndex, setCurrentIndex] = useState(0);
  const currentParagraph = paragraphs[currentIndex] || "Please go back and upload a PDF first!";

  const [quizQuestion, setQuizQuestion] = useState("");
  const [userAnswer, setUserAnswer] = useState("");
  const [loadingStatus, setLoadingStatus] = useState("");
  const [feedback, setFeedback] = useState("");
  const [failureCount, setFailureCount] = useState(0);

  const [showEmpatheticChoice, setShowEmpatheticChoice] = useState(false);
  const [showReframe, setShowReframe] = useState(false);
  const [reframeText, setReframeText] = useState("");
  const [isReframing, setIsReframing] = useState(false);
  const [youtubeVideos, setYoutubeVideos] = useState([]);
  const [isSearchingVideos, setIsSearchingVideos] = useState(false);

  const [showCheckIn, setShowCheckIn] = useState(false);
  const [checkInCount, setCheckInCount] = useState(0);

  const [isListening, setIsListening] = useState(false);
  const [isReading, setIsReading] = useState(false);
  const speechSynthRef = useRef(window.speechSynthesis);

  const [focusScore, setFocusScore] = useState(100);
  const [sessionStartTime] = useState(Date.now());
  const [distractionCount, setDistractionCount] = useState(0);

  const { isBlindMode } = useUser();

  // ===== LOAD COINS =====
  useEffect(() => {
    const fetchCoins = async () => {
      if (auth.currentUser) {
        const data = await loadUserData(auth.currentUser.uid);
        setFocusCoins(data.focusCoins);
      }
    };
    fetchCoins();
  }, []);

  // ===== FOCUS SCORE RECOVERY =====
  useEffect(() => {
    focusTimerRef.current = setInterval(() => {
      setFocusScore(prev => Math.min(100, prev + 5));
    }, 30000);
    return () => clearInterval(focusTimerRef.current);
  }, []);

  // ===== TTS =====
  const speakText = useCallback((text, onEnd) => {
    speechSynthRef.current.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 0.9;
    utterance.onstart = () => setIsReading(true);
    utterance.onend = () => {
      setIsReading(false);
      if (onEnd) onEnd();
    };
    speechSynthRef.current.speak(utterance);
  }, []);

  const toggleReadAloud = () => {
    if (isReading) {
      speechSynthRef.current.cancel();
      setIsReading(false);
    } else {
      speakText(currentParagraph);
    }
  };

  useEffect(() => {
    return () => speechSynthRef.current.cancel();
  }, []);

  // ===== DISTRACTION TRIGGER =====
  const doTriggerDistraction = useCallback(async () => {
    // This is the actual trigger — called only when we confirm distraction
    setIsDistracted(true);
    isDistractedRef.current = true;
    consecutiveAwayRef.current = 0;
    speechSynthRef.current.cancel();
    setIsReading(false);
    setLoadingStatus("generating");
    setFeedback("");
    setUserAnswer("");
    setShowEmpatheticChoice(false);
    setFocusScore(prev => Math.max(0, prev - 15));
    setDistractionCount(prev => prev + 1);

    const question = await generatePopQuiz(currentParagraph);
    setQuizQuestion(question);
    setLoadingStatus("");
  }, [currentParagraph]);

  // ===== TAB SWITCH DETECTION =====
  useEffect(() => {
    const handler = () => {
      if (document.hidden && !isDistractedRef.current) {
        doTriggerDistraction();
      }
    };
    document.addEventListener("visibilitychange", handler);
    return () => document.removeEventListener("visibilitychange", handler);
  }, [doTriggerDistraction]);

  // ===== BLAZEFACE — STABLE, NO FLICKER =====
  useEffect(() => {
    if (isBlindMode) return;

    const startDetection = async () => {
      try {
        const model = await blazeface.load();
        modelRef.current = model;
        setIsVisionLoaded(true);
        setGazeStatus("focused");

        intervalRef.current = setInterval(async () => {
          // CHECK REF FIRST — this is the flicker fix
          if (isDistractedRef.current) {
            consecutiveAwayRef.current = 0;
            return;
          }

          if (!webcamRef.current || !webcamRef.current.video || webcamRef.current.video.readyState !== 4) return;

          try {
            const video = webcamRef.current.video;
            const predictions = await modelRef.current.estimateFaces(video, false);

            if (predictions.length === 0) {
              consecutiveAwayRef.current++;

              if (consecutiveAwayRef.current >= 2) {
                setGazeStatus("no-face");
              }

              if (consecutiveAwayRef.current >= 3 && !isDistractedRef.current) {
                doTriggerDistraction();
              }
            } else {
              const face = predictions[0];
              const topLeft = face.topLeft;
              const bottomRight = face.bottomRight;
              const vw = video.videoWidth;
              const vh = video.videoHeight;

              const normX = ((topLeft[0] + bottomRight[0]) / 2) / vw;
              const normY = ((topLeft[1] + bottomRight[1]) / 2) / vh;
              const faceWidth = Math.abs(bottomRight[0] - topLeft[0]);
              const faceRatio = faceWidth / vw;

              const isLookingAtScreen = normX > 0.15 && normX < 0.85 && normY > 0.1 && normY < 0.75 && faceRatio > 0.08;

              if (isLookingAtScreen) {
                setGazeStatus("focused");
                consecutiveAwayRef.current = 0;
              } else {
                setGazeStatus("looking-away");
                consecutiveAwayRef.current++;

                if (consecutiveAwayRef.current >= 3 && !isDistractedRef.current) {
                  doTriggerDistraction();
                }
              }
            }
          } catch (err) {
            // Silently handle detection errors
          }
        }, 2500);
      } catch (err) {
        console.error("BlazeFace load error:", err);
      }
    };

    startDetection();

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [isBlindMode, doTriggerDistraction]);

  // ===== PROACTIVE CHECK-IN =====
  useEffect(() => {
    if (currentIndex > 0 && currentIndex % 2 === 0 && !isDistractedRef.current) {
      setCheckInCount(prev => prev + 1);
      setShowCheckIn(true);
      if (isBlindMode || isReading) {
        speechSynthRef.current.cancel();
        setIsReading(false);
        speakText("Quick check. Did you understand that section?");
      }
    }
  }, [currentIndex]);

  // ===== ANSWER GRADING =====
  const handleSubmitAnswer = async () => {
    if (!userAnswer.trim()) return;
    setLoadingStatus("grading");
    const result = await gradeAnswer(quizQuestion, userAnswer);

    if (result.startsWith("CORRECT")) {
      const newTotal = focusCoins + 10;
      setFocusCoins(newTotal);
      if (auth.currentUser) await saveFocusCoins(auth.currentUser.uid, newTotal);
      setFocusScore(prev => Math.min(100, prev + 10));
      setIsDistracted(false);
      isDistractedRef.current = false;
      setLoadingStatus("");
      setFailureCount(0);
      speakText("Correct! Resuming.");
    } else {
      setLoadingStatus("");
      setFeedback(result);
      const fc = failureCount + 1;
      setFailureCount(fc);
      if (fc >= 2) {
        setShowEmpatheticChoice(true);
        speakText("Were you distracted or didn't understand?");
      }
    }
  };

  // ===== EMPATHETIC HANDLERS =====
  const handleDistractedChoice = () => {
    setShowEmpatheticChoice(false);
    setIsDistracted(false);
    isDistractedRef.current = false;
    setFailureCount(0);
    speakText("No worries! Re-reading that section.");
  };

  const handleDidntUnderstand = async () => {
    setShowEmpatheticChoice(false);
    setIsDistracted(false);
    isDistractedRef.current = false;
    setFailureCount(0);
    setShowReframe(true);
    setIsReframing(true);
    const reframe = await reframeContent(currentParagraph);
    setReframeText(reframe);
    setIsReframing(false);
    speakText(reframe);
    setIsSearchingVideos(true);
    const videos = await searchYouTube(currentParagraph.split('.')[0]);
    setYoutubeVideos(videos);
    setIsSearchingVideos(false);
  };

  // ===== CHECK-IN HANDLERS =====
  const handleCheckInUnderstood = () => {
    setShowCheckIn(false);
    const newTotal = focusCoins + 5;
    setFocusCoins(newTotal);
    if (auth.currentUser) saveFocusCoins(auth.currentUser.uid, newTotal);
    speakText("Awesome! Keep going.");
  };

  const handleCheckInConfused = async () => {
    setShowCheckIn(false);
    setShowReframe(true);
    setIsReframing(true);
    const reframe = await reframeContent(currentParagraph);
    setReframeText(reframe);
    setIsReframing(false);
    speakText(reframe);
    setIsSearchingVideos(true);
    const videos = await searchYouTube(currentParagraph.split('.')[0]);
    setYoutubeVideos(videos);
    setIsSearchingVideos(false);
  };

  const handleCloseReframe = () => {
    setShowReframe(false);
    setReframeText("");
    setYoutubeVideos([]);
  };

  // ===== NAVIGATION =====
  const goNext = () => {
    if (currentIndex < paragraphs.length - 1) {
      speechSynthRef.current.cancel();
      setIsReading(false);
      setCurrentIndex(prev => prev + 1);
    }
  };

  const goPrev = () => {
    if (currentIndex > 0) {
      speechSynthRef.current.cancel();
      setIsReading(false);
      setCurrentIndex(prev => prev - 1);
    }
  };

  // ===== QUIZ VOICE INPUT =====
  const startListeningForAnswer = () => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) return;
    const rec = new SR();
    rec.continuous = false;
    rec.interimResults = false;
    rec.lang = 'en-US';
    rec.onstart = () => setIsListening(true);
    rec.onresult = (e) => {
      setUserAnswer(e.results[0][0].transcript);
      setIsListening(false);
    };
    rec.onerror = () => setIsListening(false);
    rec.onend = () => setIsListening(false);
    rec.start();
  };

  // ===== GAZE UI =====
  const progressPercent = paragraphs.length > 0 ? Math.round(((currentIndex + 1) / paragraphs.length) * 100) : 0;

  const gazeColors = {
    'loading': { bg: '#f0f0f0', border: '#ddd', text: '⏳ Loading AI Vision...', color: '#999' },
    'focused': { bg: '#d4edda', border: '#2ecc71', text: '🟢 Focused — Looking at Screen', color: '#155724' },
    'looking-away': { bg: '#fff3cd', border: '#f39c12', text: '👀 Looking Away — Warning', color: '#856404' },
    'no-face': { bg: '#f8d7da', border: '#e74c3c', text: '⚠️ No Face — Come Back!', color: '#721c24' },
  };
  const gazeInfo = gazeColors[gazeStatus] || gazeColors['loading'];

  // ===== RENDER =====
  return (
    <div style={{ padding: '24px', fontFamily: "'Inter', sans-serif", minHeight: '100vh' }}>

      {/* HEADER */}
      <div className="cognify-header">
        <button onClick={() => { speechSynthRef.current.cancel(); navigate('/'); }} className="cognify-btn-secondary">
          <ArrowLeft size={18} /> Back
        </button>
        <h2 style={{ color: '#4b0082', margin: 0, fontSize: '20px' }}>📖 Read Mode</h2>
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
          <div className="cognify-coins">🪙 {focusCoins}</div>
          <div className={`cognify-status ${isDistracted ? 'distracted' : showReframe ? 'remediation' : 'focused'}`}>
            {isDistracted ? 'DISTRACTED' : showReframe ? 'HELP MODE' : 'FOCUSED'}
          </div>
        </div>
      </div>

      {/* PROGRESS */}
      <div style={{ margin: '0 0 20px 0' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', color: '#888', marginBottom: '6px' }}>
          <span>Section {currentIndex + 1} of {paragraphs.length}</span>
          <span>{progressPercent}%</span>
        </div>
        <div className="cognify-focus-bar">
          <div className="cognify-focus-fill" style={{ width: `${progressPercent}%`, backgroundColor: '#4b0082' }} />
        </div>
      </div>

      <div style={{ display: 'flex', gap: '24px' }}>

        {/* MAIN CONTENT */}
        <div style={{ flex: 2.5, position: 'relative' }}>
          <div className="cognify-card" style={{ position: 'relative', minHeight: '500px' }}>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', borderBottom: '1px solid #f0f0f0', paddingBottom: '16px' }}>
              <button onClick={goPrev} disabled={currentIndex === 0} className="cognify-btn-secondary" style={{ opacity: currentIndex === 0 ? 0.4 : 1 }}>
                <ChevronLeft size={18} /> Prev
              </button>
              <button onClick={toggleReadAloud} className={isReading ? "cognify-btn-danger" : "cognify-btn-primary"}>
                {isReading ? <><VolumeX size={18} /> Stop</> : <><Volume2 size={18} /> Read Aloud</>}
              </button>
              <button onClick={goNext} disabled={currentIndex === paragraphs.length - 1} className="cognify-btn-secondary" style={{ opacity: currentIndex === paragraphs.length - 1 ? 0.4 : 1 }}>
                Next <ChevronRight size={18} />
              </button>
            </div>

            <div className="cognify-reading-area" style={{ filter: (isDistracted || showReframe) ? 'blur(5px)' : 'none' }}>
              {paragraphs.map((para, idx) => (
                <div key={idx} className={`cognify-paragraph ${idx === currentIndex ? 'active' : ''} ${idx < currentIndex ? 'completed' : ''}`}
                  style={{ display: Math.abs(idx - currentIndex) <= 1 ? 'block' : 'none' }}>
                  <p>{para}</p>
                </div>
              ))}
            </div>

            {/* QUIZ */}
            {isDistracted && !showEmpatheticChoice && (
              <div className="cognify-overlay">
                <div className="cognify-quiz-card">
                  <AlertTriangle size={45} color="#e74c3c" style={{ marginBottom: '12px' }} />
                  <h2 style={{ color: '#e74c3c', marginBottom: '8px' }}>Session Paused</h2>
                  <p style={{ color: '#888', marginBottom: '20px' }}>Answer to continue</p>
                  <p style={{ fontSize: '20px', fontWeight: 700, color: '#1a1a2e', margin: '20px 0' }}>
                    {loadingStatus === "generating" ? "Generating..." : loadingStatus === "grading" ? "Grading..." : quizQuestion}
                  </p>
                  {!loadingStatus && (
                    <div style={{ marginTop: '20px' }}>
                      <div style={{ display: 'flex', gap: '10px', marginBottom: '16px' }}>
                        <input type="text" value={userAnswer} onChange={(e) => setUserAnswer(e.target.value)}
                          onKeyDown={(e) => e.key === 'Enter' && handleSubmitAnswer()}
                          placeholder="Type or speak..." className="cognify-input" style={{ flex: 1 }} />
                        <button onClick={startListeningForAnswer} className={isListening ? "cognify-btn-danger" : "cognify-btn-secondary"}>
                          <Mic size={20} />
                        </button>
                      </div>
                      <button onClick={handleSubmitAnswer} className="cognify-btn-primary" style={{ width: '100%', justifyContent: 'center', padding: '14px' }}>Submit</button>
                    </div>
                  )}
                  {feedback && <p style={{ color: '#e74c3c', marginTop: '16px', fontWeight: 600 }}>❌ {feedback}<br /><span style={{ fontSize: '13px', color: '#999' }}>Attempt {failureCount}/2</span></p>}
                </div>
              </div>
            )}

            {/* EMPATHETIC */}
            {showEmpatheticChoice && (
              <div className="cognify-overlay">
                <div className="cognify-quiz-card" style={{ border: '3px solid #4b0082' }}>
                  <Brain size={45} color="#4b0082" style={{ marginBottom: '12px' }} />
                  <h2 style={{ color: '#4b0082' }}>Let me help</h2>
                  <p style={{ color: '#666', margin: '16px 0 24px', fontSize: '16px' }}>Were you distracted, or didn't understand?</p>
                  <div style={{ display: 'flex', gap: '16px', justifyContent: 'center', flexWrap: 'wrap' }}>
                    <button onClick={handleDistractedChoice} className="cognify-btn-secondary" style={{ padding: '16px 24px', fontSize: '15px' }}>😅 Distracted — repeat</button>
                    <button onClick={handleDidntUnderstand} className="cognify-btn-primary" style={{ padding: '16px 24px', fontSize: '15px' }}>🤔 Didn't understand</button>
                  </div>
                </div>
              </div>
            )}

            {/* CHECK-IN */}
            {showCheckIn && (
              <div className="cognify-overlay">
                <div className="cognify-quiz-card" style={{ border: '3px solid #2ecc71' }}>
                  <Brain size={45} color="#2ecc71" style={{ marginBottom: '12px' }} />
                  <h2 style={{ color: '#2ecc71' }}>Quick Check-In</h2>
                  <p style={{ color: '#666', margin: '16px 0 24px', fontSize: '16px' }}>Did you understand that section?</p>
                  <div style={{ display: 'flex', gap: '16px', justifyContent: 'center', flexWrap: 'wrap' }}>
                    <button onClick={handleCheckInUnderstood} className="cognify-btn-success" style={{ padding: '16px 24px', fontSize: '15px' }}>✅ Got it (+5 coins)</button>
                    <button onClick={handleCheckInConfused} className="cognify-btn-primary" style={{ padding: '16px 24px', fontSize: '15px' }}>🤔 Explain differently</button>
                  </div>
                </div>
              </div>
            )}

            {/* REFRAME + YOUTUBE */}
            {showReframe && (
              <div className="cognify-overlay">
                <div style={{ maxWidth: '700px', width: '100%', maxHeight: '90vh', overflowY: 'auto' }}>
                  <div className="cognify-quiz-card" style={{ border: '3px solid #4b0082', marginBottom: '20px' }}>
                    <Brain size={40} color="#4b0082" style={{ marginBottom: '10px' }} />
                    <h2 style={{ color: '#4b0082', marginBottom: '16px' }}>Simplified Explanation</h2>
                    {isReframing
                      ? <p style={{ color: '#888', fontSize: '16px' }}>Generating simpler explanation...</p>
                      : <p style={{ fontSize: '17px', lineHeight: 1.8, color: '#333', textAlign: 'left', padding: '0 10px' }}>{reframeText}</p>
                    }
                  </div>
                  {(isSearchingVideos || youtubeVideos.length > 0) && (
                    <div className="cognify-quiz-card" style={{ border: '3px solid #e74c3c' }}>
                      <PlayCircle size={35} color="#e74c3c" style={{ marginBottom: '10px' }} />
                      <h3 style={{ color: '#e74c3c', marginBottom: '20px' }}>Recommended Tutorials</h3>
                      {isSearchingVideos
                        ? <p style={{ color: '#888' }}>Searching for tutorials...</p>
                        : youtubeVideos.map((v, i) => (
                          <a key={i} href={`https://www.youtube.com/watch?v=${v.videoId}`} target="_blank" rel="noopener noreferrer"
                            className="cognify-video-card" style={{ display: 'flex', gap: '12px', padding: '12px', textDecoration: 'none', color: 'inherit', marginBottom: '8px' }}>
                            <img src={v.thumbnail} alt="" style={{ width: '140px', height: '80px', borderRadius: '8px', objectFit: 'cover' }} />
                            <p style={{ fontWeight: 600, fontSize: '14px', margin: 0, display: 'flex', alignItems: 'center' }}>{v.title}</p>
                          </a>
                        ))
                      }
                    </div>
                  )}
                  <div style={{ textAlign: 'center', marginTop: '20px' }}>
                    <button onClick={handleCloseReframe} className="cognify-btn-success" style={{ padding: '14px 40px', fontSize: '16px' }}>✅ I understand — Resume</button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* SIDEBAR */}
        <div style={{ flex: 1, minWidth: '280px' }}>

          {/* Webcam */}
          {!isBlindMode && (
            <div className="cognify-card" style={{ textAlign: 'center', marginBottom: '20px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', marginBottom: '10px' }}>
                <BookOpenText size={18} color="#4b0082" />
                <h4 style={{ margin: 0, color: '#4b0082', fontSize: '14px' }}>AI Gaze Tracker</h4>
              </div>
              <Webcam ref={webcamRef} audio={false} width="100%"
                style={{ borderRadius: '10px', border: `3px solid ${gazeInfo.border}`, transform: 'scaleX(-1)' }} />
              <div style={{
                marginTop: '8px', padding: '8px 12px', borderRadius: '8px',
                backgroundColor: gazeInfo.bg, color: gazeInfo.color,
                fontSize: '12px', fontWeight: 600, transition: 'all 0.3s ease'
              }}>
                {gazeInfo.text}
              </div>
            </div>
          )}

          {/* Focus Score */}
          <div className="cognify-card" style={{ textAlign: 'center', marginBottom: '20px' }}>
            <h4 style={{ color: '#4b0082', marginBottom: '12px', fontSize: '14px' }}>Focus Score</h4>
            <div style={{ fontSize: '42px', fontWeight: 800, color: focusScore >= 70 ? '#2ecc71' : focusScore >= 40 ? '#f39c12' : '#e74c3c' }}>
              {focusScore}%
            </div>
            <div className="cognify-focus-bar" style={{ marginTop: '12px' }}>
              <div className="cognify-focus-fill" style={{
                width: `${focusScore}%`,
                backgroundColor: focusScore >= 70 ? '#2ecc71' : focusScore >= 40 ? '#f39c12' : '#e74c3c'
              }} />
            </div>
            <p style={{ fontSize: '11px', color: '#999', marginTop: '8px' }}>{distractionCount} distractions detected</p>
          </div>

          {/* Session Info */}
          <div className="cognify-card" style={{ fontSize: '13px', color: '#888' }}>
            <div style={{ marginBottom: '6px' }}>📄 {paragraphs.length} sections loaded</div>
            <div style={{ marginBottom: '6px' }}>🧠 {checkInCount} check-ins completed</div>
            <div>⏱️ Session: {Math.round((Date.now() - sessionStartTime) / 60000)} min</div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ReadMode;