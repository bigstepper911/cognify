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
  const noFaceTimer = useRef(null);
  const focusTimerRef = useRef(null);

  const [focusCoins, setFocusCoins] = useState(0);
  const [isDistracted, setIsDistracted] = useState(false);
  const [isVisionLoaded, setIsVisionLoaded] = useState(false);

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

  const [showVideoFallback, setShowVideoFallback] = useState(false);
  const [youtubeVideos, setYoutubeVideos] = useState([]);
  const [isSearchingVideos, setIsSearchingVideos] = useState(false);

  const [showCheckIn, setShowCheckIn] = useState(false);
  const [checkInCount, setCheckInCount] = useState(0);

  const [isVoiceActive, setIsVoiceActive] = useState(false);
  const [lastVoiceCommand, setLastVoiceCommand] = useState("");
  const [isListening, setIsListening] = useState(false);

  const [isReading, setIsReading] = useState(false);
  const speechSynthRef = useRef(window.speechSynthesis);

  const [focusScore, setFocusScore] = useState(100);
  const [sessionStartTime] = useState(Date.now());
  const [focusHistory, setFocusHistory] = useState([]);

  const { isBlindMode } = useUser();

  // Load coins
  useEffect(() => {
    const fetchCoins = async () => {
      if (auth.currentUser) {
        const data = await loadUserData(auth.currentUser.uid);
        setFocusCoins(data.focusCoins);
      }
    };
    fetchCoins();
  }, []);

  // Focus score: recovers 5 points every 30 seconds
  useEffect(() => {
    focusTimerRef.current = setInterval(() => {
      setFocusScore(prev => Math.min(100, prev + 5));
    }, 30000);
    return () => clearInterval(focusTimerRef.current);
  }, []);

  // Text to speech
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

  // Cleanup on unmount
  useEffect(() => {
    return () => speechSynthRef.current.cancel();
  }, []);

  // Trigger distraction
  const triggerDistraction = useCallback(async () => {
    if (isDistracted || showVideoFallback || showCheckIn || showReframe || showEmpatheticChoice) return;

    setIsDistracted(true);
    speechSynthRef.current.cancel();
    setIsReading(false);
    setLoadingStatus("generating");
    setFeedback("");
    setUserAnswer("");
    setShowEmpatheticChoice(false);

    // Drop focus score
    setFocusScore(prev => Math.max(0, prev - 15));
    setFocusHistory(prev => [...prev, { time: Date.now(), event: 'distracted' }]);

    const question = await generatePopQuiz(currentParagraph);
    setQuizQuestion(question);
    setLoadingStatus("");
  }, [isDistracted, showVideoFallback, showCheckIn, showReframe, showEmpatheticChoice, currentParagraph]);

  // Tab-switching detection
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.hidden && !isDistracted && !showVideoFallback && !showCheckIn) {
        triggerDistraction();
      }
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, [isDistracted, showVideoFallback, showCheckIn, triggerDistraction]);

  // Face detection with 5-second grace period
  useEffect(() => {
    if (isBlindMode) return;

    let runInterval;
    const runFaceDetection = async () => {
      try {
        const model = await blazeface.load();
        setIsVisionLoaded(true);

        runInterval = setInterval(async () => {
          if (isDistracted || showVideoFallback || showCheckIn || showReframe || showEmpatheticChoice) return;

          if (webcamRef.current && webcamRef.current.video.readyState === 4) {
            const video = webcamRef.current.video;
            const predictions = await model.estimateFaces(video, false);

            if (predictions.length === 0) {
              if (!noFaceTimer.current) {
                noFaceTimer.current = setTimeout(() => {
                  triggerDistraction();
                  noFaceTimer.current = null;
                }, 5000);
              }
            } else {
              if (noFaceTimer.current) {
                clearTimeout(noFaceTimer.current);
                noFaceTimer.current = null;
              }
            }
          }
        }, 2000);
      } catch (err) {
        console.error("Face detection failed to load:", err);
      }
    };

    runFaceDetection();
    return () => {
      clearInterval(runInterval);
      if (noFaceTimer.current) clearTimeout(noFaceTimer.current);
    };
  }, [isDistracted, showVideoFallback, showCheckIn, showReframe, showEmpatheticChoice, isBlindMode, triggerDistraction]);

  // Proactive check-in every 2 paragraphs
  useEffect(() => {
    if (currentIndex > 0 && currentIndex % 2 === 0 && !isDistracted && !showVideoFallback) {
      setCheckInCount(prev => prev + 1);
      setShowCheckIn(true);

      if (isBlindMode || isReading) {
        speechSynthRef.current.cancel();
        setIsReading(false);
        speakText("Quick check. Did you understand that section, or should I explain it differently?");
      }
    }
  }, [currentIndex]);

  // Grade answer + empathetic flow
  const handleSubmitAnswer = async () => {
    if (!userAnswer.trim()) return;

    setLoadingStatus("grading");
    const result = await gradeAnswer(quizQuestion, userAnswer);

    if (result.startsWith("CORRECT")) {
      const newTotal = focusCoins + 10;
      setFocusCoins(newTotal);
      if (auth.currentUser) await saveFocusCoins(auth.currentUser.uid, newTotal);

      setFocusScore(prev => Math.min(100, prev + 10));
      setFocusHistory(prev => [...prev, { time: Date.now(), event: 'correct' }]);
      setIsDistracted(false);
      setLoadingStatus("");
      setFailureCount(0);

      speakText("Correct! Great focus. Resuming your study session.");
    } else {
      setLoadingStatus("");
      setFeedback(result);

      const newFailureCount = failureCount + 1;
      setFailureCount(newFailureCount);

      if (newFailureCount >= 2) {
        setShowEmpatheticChoice(true);
        speakText("You seem to be struggling. Were you distracted, or did you not understand the material?");
      }
    }
  };

  const handleDistractedChoice = () => {
    setShowEmpatheticChoice(false);
    setIsDistracted(false);
    setFailureCount(0);
    speakText("No worries! Let me re-read that section for you.");
  };

  const handleDidntUnderstand = async () => {
    setShowEmpatheticChoice(false);
    setIsDistracted(false);
    setFailureCount(0);

    setShowReframe(true);
    setIsReframing(true);
    const reframe = await reframeContent(currentParagraph);
    setReframeText(reframe);
    setIsReframing(false);
    speakText(reframe);

    setIsSearchingVideos(true);
    const firstSentence = currentParagraph.split('.')[0];
    const videos = await searchYouTube(firstSentence);
    setYoutubeVideos(videos);
    setIsSearchingVideos(false);
  };

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
    const firstSentence = currentParagraph.split('.')[0];
    const videos = await searchYouTube(firstSentence);
    setYoutubeVideos(videos);
    setIsSearchingVideos(false);
  };

  const handleCloseReframe = () => {
    setShowReframe(false);
    setReframeText("");
    setYoutubeVideos([]);
    setShowVideoFallback(false);
  };

  // Paragraph navigation
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

  // Voice commands — stable, no flicker
  useEffect(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) return;

    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = false;
    recognition.lang = 'en-US';

    recognition.onstart = () => setIsVoiceActive(true);

    recognition.onresult = (event) => {
      const last = event.results[event.results.length - 1];
      const command = last[0].transcript.toLowerCase().trim();
      setLastVoiceCommand(command);

      if (command.includes("next") || command.includes("continue")) {
        goNext();
      } else if (command.includes("back") || command.includes("previous") || command.includes("repeat")) {
        goPrev();
      } else if (command.includes("read") || command.includes("play")) {
        toggleReadAloud();
      } else if (command.includes("pause") || command.includes("stop")) {
        speechSynthRef.current.cancel();
        setIsReading(false);
      } else if (command.includes("summarize") || command.includes("summary")) {
        speakText("Here is a simplified version.");
        handleCheckInConfused();
      } else if (command.includes("explain") || command.includes("help")) {
        handleCheckInConfused();
      } else if (command.includes("yes") || command.includes("understood") || command.includes("got it")) {
        if (showCheckIn) handleCheckInUnderstood();
      } else if (command.includes("no") || command.includes("confused") || command.includes("don't understand")) {
        if (showCheckIn) handleCheckInConfused();
      } else if (command.includes("distracted")) {
        if (showEmpatheticChoice) handleDistractedChoice();
      }
    };

    recognition.onerror = (e) => {
      if (e.error !== 'no-speech' && e.error !== 'aborted') {
        console.error("Voice command error:", e.error);
      }
    };

    recognition.onend = () => {
      setTimeout(() => {
        try { recognition.start(); } catch (e) {}
      }, 2000);
    };

    try { recognition.start(); } catch (e) {}

    return () => {
      try { recognition.stop(); } catch (e) {}
    };
  }, []);

  // Speech-to-text for quiz answers
  const startListeningForAnswer = () => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) return;

    const recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.lang = 'en-US';

    recognition.onstart = () => setIsListening(true);
    recognition.onresult = (event) => {
      setUserAnswer(event.results[0][0].transcript);
      setIsListening(false);
    };
    recognition.onerror = () => setIsListening(false);
    recognition.onend = () => setIsListening(false);
    recognition.start();
  };

  const progressPercent = paragraphs.length > 0 ? Math.round(((currentIndex + 1) / paragraphs.length) * 100) : 0;

  return (
    <div style={{ padding: '24px', fontFamily: "'Inter', sans-serif", minHeight: '100vh' }}>

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

      <div style={{ margin: '0 0 20px 0' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', color: '#888', marginBottom: '6px' }}>
          <span>Section {currentIndex + 1} of {paragraphs.length}</span>
          <span>{progressPercent}% Complete</span>
        </div>
        <div className="cognify-focus-bar">
          <div className="cognify-focus-fill" style={{ width: `${progressPercent}%`, backgroundColor: '#4b0082' }} />
        </div>
      </div>

      <div style={{ display: 'flex', gap: '24px' }}>

        <div style={{ flex: 2.5, position: 'relative' }}>
          <div className="cognify-card" style={{ position: 'relative', minHeight: '500px' }}>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', borderBottom: '1px solid #f0f0f0', paddingBottom: '16px' }}>
              <button onClick={goPrev} disabled={currentIndex === 0} className="cognify-btn-secondary" style={{ opacity: currentIndex === 0 ? 0.4 : 1 }}>
                <ChevronLeft size={18} /> Previous
              </button>
              <button onClick={toggleReadAloud} className={isReading ? "cognify-btn-danger" : "cognify-btn-primary"}>
                {isReading ? <><VolumeX size={18} /> Stop Reading</> : <><Volume2 size={18} /> Read Aloud</>}
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

            {/* Quiz Overlay */}
            {isDistracted && !showEmpatheticChoice && (
              <div className="cognify-overlay">
                <div className="cognify-quiz-card">
                  <AlertTriangle size={45} color="#e74c3c" style={{ marginBottom: '12px' }} />
                  <h2 style={{ color: '#e74c3c', marginBottom: '8px' }}>Session Paused</h2>
                  <p style={{ color: '#888', marginBottom: '24px' }}>Answer this recall question to continue</p>
                  <p style={{ fontSize: '20px', fontWeight: 700, color: '#1a1a2e', margin: '20px 0' }}>
                    {loadingStatus === "generating" ? "Generating quiz..." : loadingStatus === "grading" ? "Grading..." : quizQuestion}
                  </p>
                  {!loadingStatus && (
                    <div style={{ marginTop: '24px' }}>
                      <div style={{ display: 'flex', gap: '10px', marginBottom: '16px' }}>
                        <input type="text" value={userAnswer} onChange={(e) => setUserAnswer(e.target.value)}
                          onKeyDown={(e) => e.key === 'Enter' && handleSubmitAnswer()}
                          placeholder="Type or speak your answer..." className="cognify-input" style={{ flex: 1 }} />
                        <button onClick={startListeningForAnswer} className={isListening ? "cognify-btn-danger" : "cognify-btn-secondary"}>
                          <Mic size={20} /> {isListening ? "..." : "Speak"}
                        </button>
                      </div>
                      <button onClick={handleSubmitAnswer} className="cognify-btn-primary" style={{ width: '100%', justifyContent: 'center', padding: '14px' }}>
                        Submit Answer
                      </button>
                    </div>
                  )}
                  {feedback && (
                    <p style={{ color: '#e74c3c', marginTop: '16px', fontWeight: 600 }}>
                      ❌ {feedback} <br /><span style={{ fontSize: '13px', color: '#999' }}>Attempt {failureCount}/2</span>
                    </p>
                  )}
                </div>
              </div>
            )}

            {/* Empathetic Choice */}
            {showEmpatheticChoice && (
              <div className="cognify-overlay">
                <div className="cognify-quiz-card" style={{ border: '3px solid #4b0082' }}>
                  <Brain size={45} color="#4b0082" style={{ marginBottom: '12px' }} />
                  <h2 style={{ color: '#4b0082', marginBottom: '8px' }}>Let me help you</h2>
                  <p style={{ color: '#666', marginBottom: '30px', fontSize: '18px' }}>
                    Were you distracted, or did you not understand the material?
                  </p>
                  <div style={{ display: 'flex', gap: '16px', justifyContent: 'center', flexWrap: 'wrap' }}>
                    <button onClick={handleDistractedChoice} className="cognify-btn-secondary" style={{ padding: '16px 28px', fontSize: '16px' }}>
                      😅 I was distracted — repeat it
                    </button>
                    <button onClick={handleDidntUnderstand} className="cognify-btn-primary" style={{ padding: '16px 28px', fontSize: '16px' }}>
                      🤔 I didn't understand — explain differently
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Check-In */}
            {showCheckIn && (
              <div className="cognify-overlay">
                <div className="cognify-quiz-card" style={{ border: '3px solid #2ecc71' }}>
                  <Brain size={45} color="#2ecc71" style={{ marginBottom: '12px' }} />
                  <h2 style={{ color: '#2ecc71', marginBottom: '8px' }}>Quick Check-In</h2>
                  <p style={{ color: '#666', marginBottom: '30px', fontSize: '18px' }}>
                    Did you understand that section, or should I explain it differently?
                  </p>
                  <div style={{ display: 'flex', gap: '16px', justifyContent: 'center', flexWrap: 'wrap' }}>
                    <button onClick={handleCheckInUnderstood} className="cognify-btn-success" style={{ padding: '16px 28px', fontSize: '16px' }}>
                      ✅ Yes, I got it! (+5 coins)
                    </button>
                    <button onClick={handleCheckInConfused} className="cognify-btn-primary" style={{ padding: '16px 28px', fontSize: '16px' }}>
                      🤔 Explain it differently
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Reframe + YouTube */}
            {showReframe && (
              <div className="cognify-overlay">
                <div style={{ maxWidth: '700px', width: '100%', maxHeight: '90vh', overflowY: 'auto' }}>
                  <div className="cognify-quiz-card" style={{ border: '3px solid #4b0082', marginBottom: '20px' }}>
                    <Brain size={40} color="#4b0082" style={{ marginBottom: '10px' }} />
                    <h2 style={{ color: '#4b0082', marginBottom: '16px' }}>AI Simplified Explanation</h2>
                    {isReframing ? (
                      <p style={{ color: '#888', fontSize: '16px' }}>Generating a simpler explanation...</p>
                    ) : (
                      <p style={{ fontSize: '17px', lineHeight: 1.8, color: '#333', textAlign: 'left', padding: '0 10px' }}>{reframeText}</p>
                    )}
                  </div>

                  {(isSearchingVideos || youtubeVideos.length > 0) && (
                    <div className="cognify-quiz-card" style={{ border: '3px solid #e74c3c' }}>
                      <PlayCircle size={35} color="#e74c3c" style={{ marginBottom: '10px' }} />
                      <h3 style={{ color: '#e74c3c', marginBottom: '20px' }}>Recommended Video Tutorials</h3>
                      {isSearchingVideos ? (
                        <p style={{ color: '#888' }}>Searching for the best tutorials...</p>
                      ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                          {youtubeVideos.map((video, idx) => (
                            <a key={idx} href={`https://www.youtube.com/watch?v=${video.videoId}`} target="_blank" rel="noopener noreferrer"
                              className="cognify-video-card" style={{ display: 'flex', gap: '12px', padding: '12px', textDecoration: 'none', color: 'inherit' }}>
                              <img src={video.thumbnail} alt="" style={{ width: '160px', height: '90px', borderRadius: '8px', objectFit: 'cover' }} />
                              <div style={{ textAlign: 'left', display: 'flex', alignItems: 'center' }}>
                                <p style={{ fontWeight: 600, fontSize: '14px', color: '#1a1a2e', margin: 0 }}>{video.title}</p>
                              </div>
                            </a>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  <div style={{ textAlign: 'center', marginTop: '20px' }}>
                    <button onClick={handleCloseReframe} className="cognify-btn-success" style={{ padding: '14px 40px', fontSize: '16px' }}>
                      ✅ I understand now — Resume
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Right Sidebar */}
        <div style={{ flex: 1, minWidth: '280px' }}>

          {!isBlindMode && (
            <div className="cognify-card" style={{ textAlign: 'center', marginBottom: '20px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', marginBottom: '12px' }}>
                <BookOpenText size={18} color="#4b0082" />
                <h4 style={{ margin: 0, color: '#4b0082', fontSize: '14px' }}>AI Vision Tracker</h4>
              </div>
              {!isVisionLoaded && <p style={{ color: '#999', fontSize: '12px' }}>Loading vision model...</p>}
              <Webcam ref={webcamRef} audio={false} width="100%"
                style={{ borderRadius: '10px', border: isVisionLoaded ? '3px solid #2ecc71' : '2px solid #ddd', transform: 'scaleX(-1)' }} />
              {isVisionLoaded && <p style={{ color: '#2ecc71', fontWeight: 600, marginTop: '8px', fontSize: '13px' }}>🟢 Tracking Active</p>}
            </div>
          )}

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
          </div>

          <div className="cognify-card" style={{ marginBottom: '20px' }}>
            <h4 style={{ color: '#4b0082', marginBottom: '12px', fontSize: '14px' }}>🎙️ Voice Commands</h4>
            <div style={{ fontSize: '12px', color: isVoiceActive ? '#2ecc71' : '#999', fontWeight: 600, marginBottom: '10px' }}>
              {isVoiceActive ? '🟢 Listening...' : '🔴 Inactive'}
            </div>
            {lastVoiceCommand && (
              <div style={{ fontSize: '12px', color: '#888', padding: '8px', backgroundColor: '#f8f9fa', borderRadius: '8px' }}>
                Last: "{lastVoiceCommand}"
              </div>
            )}
            <div style={{ marginTop: '12px', fontSize: '12px', color: '#aaa', lineHeight: 1.8 }}>
              <div><b>"Next"</b> — go to next section</div>
              <div><b>"Previous"</b> — go back</div>
              <div><b>"Read"</b> — read aloud</div>
              <div><b>"Stop"</b> — pause reading</div>
              <div><b>"Explain"</b> — get simpler explanation</div>
            </div>
          </div>

          <div className="cognify-card" style={{ fontSize: '13px', color: '#888' }}>
            <div style={{ marginBottom: '8px' }}>📄 {paragraphs.length} sections loaded</div>
            <div style={{ marginBottom: '8px' }}>🧠 {checkInCount} check-ins completed</div>
            <div>⏱️ Session: {Math.round((Date.now() - sessionStartTime) / 60000)} min</div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ReadMode;