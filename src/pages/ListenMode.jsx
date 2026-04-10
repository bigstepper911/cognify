import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Headphones, Mic, Play, Pause, SkipForward, SkipBack, AlertTriangle, Brain, PlayCircle, Volume2 } from 'lucide-react';
import { generatePopQuiz, gradeAnswer, reframeContent, searchYouTube } from '../utils/gemini';
import { auth } from '../firebase';
import { loadUserData, saveFocusCoins } from '../utils/db';
import { useUser } from '../utils/UserContext';

const ListenMode = () => {
  const navigate = useNavigate();
  const speechSynthRef = useRef(window.speechSynthesis);
  const lineTimerRef = useRef(null);
  const lyricsRef = useRef(null);

  const paragraphs = JSON.parse(localStorage.getItem("cognify_paragraphs") || "[]");
  const [summary] = useState(localStorage.getItem("cognify_summary") || "");
  const [currentIndex, setCurrentIndex] = useState(() => {
    const saved = localStorage.getItem("cognify_listen_progress");
    return saved ? parseInt(saved, 10) : 0;
  });
  useEffect(() => {
    localStorage.setItem("cognify_listen_progress", currentIndex);
  }, [currentIndex]);
  const [readingMode, setReadingMode] = useState("full");
  const currentParagraph = paragraphs[currentIndex] || "Please go back and upload a PDF first!";

  const [isPlaying, setIsPlaying] = useState(false);
  const [autoPlay, setAutoPlay] = useState(false);
  const [focusCoins, setFocusCoins] = useState(0);

  // Lyrics
  const [activeLineIndex, setActiveLineIndex] = useState(-1);
  const [lines, setLines] = useState([]);

  const [isDistracted, setIsDistracted] = useState(false);
  const isDistractedRef = useRef(false);
  const [quizQuestion, setQuizQuestion] = useState("");
  const [userAnswer, setUserAnswer] = useState("");
  const [feedback, setFeedback] = useState("");
  const [loadingStatus, setLoadingStatus] = useState("");
  const [isListening, setIsListening] = useState(false);
  const [failureCount, setFailureCount] = useState(0);

  const [showEmpatheticChoice, setShowEmpatheticChoice] = useState(false);
  const [showReframe, setShowReframe] = useState(false);
  const [reframeText, setReframeText] = useState("");
  const [isReframing, setIsReframing] = useState(false);
  const [youtubeVideos, setYoutubeVideos] = useState([]);
  const [isSearchingVideos, setIsSearchingVideos] = useState(false);
  const [showCheckIn, setShowCheckIn] = useState(false);
  const [checkInCount, setCheckInCount] = useState(0);

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

  // ===== SPLIT TEXT INTO LINES =====
  useEffect(() => {
    const text = readingMode === "summary" && summary ? summary : currentParagraph;
    const words = text.split(/\s+/);
    const chunks = [];
    for (let i = 0; i < words.length; i += 8) {
      chunks.push(words.slice(i, i + 8).join(' '));
    }
    setLines(chunks);
    setActiveLineIndex(-1);
  }, [currentIndex, readingMode, summary, currentParagraph]);

  // ===== SIMPLE SPEAK (system messages) =====
  const speakText = useCallback((text, onEnd) => {
    speechSynthRef.current.cancel();
    clearInterval(lineTimerRef.current);
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 0.9;
    utterance.onend = () => { if (onEnd) onEnd(); };
    speechSynthRef.current.speak(utterance);
  }, []);

  // ===== LYRICS SPEAK =====
  const speakWithLyrics = useCallback((text, onEnd) => {
    speechSynthRef.current.cancel();
    clearInterval(lineTimerRef.current);

    const words = text.split(/\s+/);
    const chunks = [];
    for (let i = 0; i < words.length; i += 8) {
      chunks.push(words.slice(i, i + 8).join(' '));
    }
    setLines(chunks);
    setActiveLineIndex(0);

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 0.9;

    // ~135 words/min at 0.9 rate → 8 words ≈ 3.5s
    const msPerLine = 3500;

    utterance.onstart = () => {
      setIsPlaying(true);
      let lineIdx = 0;
      lineTimerRef.current = setInterval(() => {
        lineIdx++;
        if (lineIdx < chunks.length) {
          setActiveLineIndex(lineIdx);
          if (lyricsRef.current) {
            const el = lyricsRef.current.querySelector('.lyric-active');
            if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
          }
        } else {
          clearInterval(lineTimerRef.current);
        }
      }, msPerLine);
    };

    utterance.onend = () => {
      setIsPlaying(false);
      clearInterval(lineTimerRef.current);
      setActiveLineIndex(-1);
      if (onEnd) onEnd();
    };

    speechSynthRef.current.speak(utterance);
  }, []);

  // ===== PLAY CURRENT =====
  const speakCurrentParagraph = useCallback(() => {
    const text = readingMode === "summary" && summary ? summary : currentParagraph;
    speakWithLyrics(text, () => {
      if (autoPlay && currentIndex < paragraphs.length - 1) {
        if ((currentIndex + 1) % 2 === 0) {
          triggerCheckIn();
        } else {
          setCurrentIndex(prev => prev + 1);
        }
      }
    });
  }, [currentIndex, currentParagraph, readingMode, summary, autoPlay, speakWithLyrics]);

  const togglePlay = () => {
    if (isPlaying) {
      speechSynthRef.current.cancel();
      clearInterval(lineTimerRef.current);
      setIsPlaying(false);
      setAutoPlay(false);
      setActiveLineIndex(-1);
    } else {
      setAutoPlay(true);
      speakCurrentParagraph();
    }
  };

  useEffect(() => {
    if (autoPlay && !isDistracted && !showCheckIn && !showReframe && !showEmpatheticChoice) {
      speakCurrentParagraph();
    }
  }, [currentIndex]);

  useEffect(() => {
    return () => { speechSynthRef.current.cancel(); clearInterval(lineTimerRef.current); };
  }, []);

  // ===== NAVIGATION =====
  const goNext = useCallback(() => {
    if (currentIndex < paragraphs.length - 1) {
      speechSynthRef.current.cancel();
      clearInterval(lineTimerRef.current);
      setIsPlaying(false);
      setActiveLineIndex(-1);
      setCurrentIndex(prev => prev + 1);
    }
  }, [currentIndex, paragraphs.length]);

  const goPrev = useCallback(() => {
    if (currentIndex > 0) {
      speechSynthRef.current.cancel();
      clearInterval(lineTimerRef.current);
      setIsPlaying(false);
      setActiveLineIndex(-1);
      setCurrentIndex(prev => prev - 1);
    }
  }, [currentIndex]);

  const repeatCurrent = useCallback(() => { speakCurrentParagraph(); }, [speakCurrentParagraph]);

  // ===== DISTRACTION =====
  const triggerDistraction = useCallback(async () => {
    if (isDistractedRef.current || showCheckIn || showReframe || showEmpatheticChoice) return;
    setIsDistracted(true);
    isDistractedRef.current = true;
    speechSynthRef.current.cancel();
    clearInterval(lineTimerRef.current);
    setIsPlaying(false);
    setAutoPlay(false);
    setActiveLineIndex(-1);
    setLoadingStatus("generating");
    setFeedback("");
    setUserAnswer("");
    const question = await generatePopQuiz(currentParagraph);
    setQuizQuestion(question);
    setLoadingStatus("");
    speakText("Attention check! " + question);
  }, [showCheckIn, showReframe, showEmpatheticChoice, currentParagraph, speakText]);

  useEffect(() => {
    const handler = () => {
      if (document.hidden && !isDistractedRef.current && !showCheckIn && !showReframe) triggerDistraction();
    };
    document.addEventListener("visibilitychange", handler);
    return () => document.removeEventListener("visibilitychange", handler);
  }, [showCheckIn, showReframe, triggerDistraction]);

  // ===== CHECK-IN =====
  const triggerCheckIn = useCallback(() => {
    setShowCheckIn(true);
    setCheckInCount(prev => prev + 1);
    speechSynthRef.current.cancel();
    clearInterval(lineTimerRef.current);
    setIsPlaying(false);
    setActiveLineIndex(-1);
    speakText("Quick check. Did you understand that section?");
  }, [speakText]);

  const handleCheckInUnderstood = () => {
    setShowCheckIn(false);
    const newTotal = focusCoins + 5;
    setFocusCoins(newTotal);
    if (auth.currentUser) saveFocusCoins(auth.currentUser.uid, newTotal);
    speakText("Great! Moving on.", () => {
      if (currentIndex < paragraphs.length - 1) setCurrentIndex(prev => prev + 1);
    });
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

  // ===== GRADING =====
  const handleSubmitAnswer = async () => {
    if (!userAnswer.trim()) return;
    setLoadingStatus("grading");
    const result = await gradeAnswer(quizQuestion, userAnswer);
    if (result.startsWith("CORRECT")) {
      const newTotal = focusCoins + 10;
      setFocusCoins(newTotal);
      if (auth.currentUser) await saveFocusCoins(auth.currentUser.uid, newTotal);
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
      } else {
        speakText("Incorrect. " + result);
      }
    }
  };

  const handleDistractedChoice = () => {
    setShowEmpatheticChoice(false);
    setIsDistracted(false);
    isDistractedRef.current = false;
    setFailureCount(0);
    speakText("Repeating section.", () => repeatCurrent());
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

  const handleCloseReframe = () => { setShowReframe(false); setReframeText(""); setYoutubeVideos([]); };

  // ===== QUIZ VOICE INPUT =====
  const startListeningForAnswer = () => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) return;
    const rec = new SR();
    rec.continuous = false;
    rec.interimResults = false;
    rec.lang = 'en-US';
    rec.onstart = () => setIsListening(true);
    rec.onresult = (e) => { setUserAnswer(e.results[0][0].transcript); setIsListening(false); };
    rec.onerror = () => setIsListening(false);
    rec.onend = () => setIsListening(false);
    rec.start();
  };

  const progressPercent = paragraphs.length > 0 ? Math.round(((currentIndex + 1) / paragraphs.length) * 100) : 0;

  // ===== RENDER =====
  return (
    <div style={{ padding: '24px', fontFamily: "'Inter', sans-serif", minHeight: '100vh' }}>

      {/* HEADER */}
      <div className="cognify-header">
        <button onClick={() => { speechSynthRef.current.cancel(); navigate('/'); }} className="cognify-btn-secondary">
          <ArrowLeft size={18} /> Back
        </button>
        <h2 style={{ color: '#4b0082', margin: 0, fontSize: '20px' }}>🎧 Listen Mode</h2>
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
          <div className="cognify-coins">🪙 {focusCoins}</div>
          <div className={`cognify-status ${isDistracted ? 'distracted' : showReframe ? 'remediation' : 'focused'}`}>
            {isDistracted ? 'DISTRACTED' : showReframe ? 'HELP MODE' : 'FOCUSED'}
          </div>
        </div>
      </div>

      {/* PROGRESS */}
      <div style={{ margin: '0 0 24px 0' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', color: '#888', marginBottom: '6px' }}>
          <span>Section {currentIndex + 1} of {paragraphs.length}</span>
          <span>{progressPercent}%</span>
        </div>
        <div className="cognify-focus-bar">
          <div className="cognify-focus-fill" style={{ width: `${progressPercent}%`, backgroundColor: '#4b0082' }} />
        </div>
      </div>

      <div style={{ display: 'flex', gap: '24px' }}>

        {/* MAIN PLAYER */}
        <div style={{ flex: 2.5 }}>
          <div className="cognify-card" style={{ textAlign: 'center', padding: '30px' }}>

            {/* Orb */}
            <div className={isPlaying ? 'pulse-glow' : ''} style={{
              width: '100px', height: '100px', borderRadius: '50%',
              background: isPlaying ? 'linear-gradient(135deg, #2ecc71, #27ae60)' : 'linear-gradient(135deg, #4b0082, #6a1b9a)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              margin: '0 auto 20px', transition: 'all 0.5s ease',
              boxShadow: isPlaying ? '0 0 40px rgba(46,204,113,0.3)' : '0 0 20px rgba(75,0,130,0.2)'
            }}>
              <Headphones size={44} color="white" />
            </div>

            <p style={{ color: '#888', fontSize: '13px', marginBottom: '6px' }}>
              {readingMode === "summary" ? "📝 AI Summary" : "📄 Full Notes"} • Section {currentIndex + 1}
            </p>

            {/* Mode Toggle */}
            <div style={{ display: 'flex', gap: '8px', justifyContent: 'center', marginBottom: '16px' }}>
              <button onClick={() => setReadingMode("full")} className={readingMode === "full" ? "cognify-btn-primary" : "cognify-btn-secondary"} style={{ padding: '6px 14px', fontSize: '12px' }}>Full Notes</button>
              <button onClick={() => summary && summary.length > 20 ? setReadingMode("summary") : null}
                className={readingMode === "summary" ? "cognify-btn-primary" : "cognify-btn-secondary"}
                style={{ padding: '6px 14px', fontSize: '12px', opacity: summary && summary.length > 20 ? 1 : 0.4 }}>AI Summary</button>
            </div>

            {/* Controls */}
            <div style={{ display: 'flex', gap: '14px', justifyContent: 'center', alignItems: 'center', marginBottom: '20px' }}>
              <button onClick={goPrev} disabled={currentIndex === 0} className="cognify-btn-secondary"
                style={{ borderRadius: '50%', width: '46px', height: '46px', padding: 0, justifyContent: 'center', opacity: currentIndex === 0 ? 0.3 : 1 }}>
                <SkipBack size={18} />
              </button>
              <button onClick={togglePlay} className={isPlaying ? "cognify-btn-danger" : "cognify-btn-success"}
                style={{ borderRadius: '50%', width: '62px', height: '62px', padding: 0, justifyContent: 'center' }}>
                {isPlaying ? <Pause size={26} /> : <Play size={26} style={{ marginLeft: '3px' }} />}
              </button>
              <button onClick={goNext} disabled={currentIndex === paragraphs.length - 1} className="cognify-btn-secondary"
                style={{ borderRadius: '50%', width: '46px', height: '46px', padding: 0, justifyContent: 'center', opacity: currentIndex === paragraphs.length - 1 ? 0.3 : 1 }}>
                <SkipForward size={18} />
              </button>
            </div>

            {/* LYRICS */}
            <div style={{
              background: '#1a1a2e', borderRadius: '16px', padding: '10px 0',
              position: 'relative', overflow: 'hidden', minHeight: '280px'
            }}>
              <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '50px', background: 'linear-gradient(180deg, #1a1a2e, transparent)', zIndex: 2 }} />
              <div ref={lyricsRef} style={{
                maxHeight: '280px', overflowY: 'auto', padding: '40px 30px',
                scrollBehavior: 'smooth', scrollbarWidth: 'none'
              }}>
                <style>{`div[ref]::-webkit-scrollbar { width: 0; display: none; }`}</style>
                {lines.map((line, idx) => (
                  <p key={idx}
                    className={idx === activeLineIndex ? 'lyric-active' : ''}
                    style={{
                      fontSize: idx === activeLineIndex ? '22px' : '17px',
                      fontWeight: idx === activeLineIndex ? 700 : 400,
                      color: idx < activeLineIndex ? 'rgba(255,255,255,0.3)' :
                             idx === activeLineIndex ? '#ffffff' :
                             'rgba(255,255,255,0.15)',
                      textAlign: 'center',
                      padding: '10px 20px',
                      margin: '4px 0',
                      transition: 'all 0.4s ease',
                      lineHeight: 1.6,
                      transform: idx === activeLineIndex ? 'scale(1.02)' : 'scale(1)',
                    }}>
                    {line}
                  </p>
                ))}
              </div>
              <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: '50px', background: 'linear-gradient(0deg, #1a1a2e, transparent)', zIndex: 2 }} />
            </div>
          </div>
        </div>

        {/* SIDEBAR */}
        <div style={{ flex: 1, minWidth: '280px' }}>

          {/* Stats */}
          <div className="cognify-card" style={{ textAlign: 'center', marginBottom: '20px' }}>
            <h4 style={{ color: '#4b0082', marginBottom: '16px', fontSize: '14px' }}>Session</h4>
            <div style={{ display: 'flex', justifyContent: 'space-around' }}>
              <div>
                <div style={{ fontSize: '26px', fontWeight: 800, color: '#4b0082' }}>{currentIndex + 1}</div>
                <div style={{ fontSize: '11px', color: '#888' }}>Sections</div>
              </div>
              <div>
                <div style={{ fontSize: '26px', fontWeight: 800, color: '#2ecc71' }}>{checkInCount}</div>
                <div style={{ fontSize: '11px', color: '#888' }}>Check-Ins</div>
              </div>
              <div>
                <div style={{ fontSize: '26px', fontWeight: 800, color: '#ffd700' }}>{focusCoins}</div>
                <div style={{ fontSize: '11px', color: '#888' }}>Coins</div>
              </div>
            </div>
          </div>

          {/* Quick Actions */}
          <div className="cognify-card">
            <h4 style={{ color: '#4b0082', marginBottom: '12px', fontSize: '14px' }}>Quick Actions</h4>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <button onClick={repeatCurrent} className="cognify-btn-secondary" style={{ width: '100%', justifyContent: 'center' }}>
                <Volume2 size={16} /> Repeat Section
              </button>
              <button onClick={() => handleCheckInConfused()} className="cognify-btn-secondary" style={{ width: '100%', justifyContent: 'center' }}>
                <Brain size={16} /> Explain Simply
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ===== OVERLAYS ===== */}
      {isDistracted && !showEmpatheticChoice && (
        <div className="cognify-overlay">
          <div className="cognify-quiz-card">
            <AlertTriangle size={45} color="#e74c3c" style={{ marginBottom: '12px' }} />
            <h2 style={{ color: '#e74c3c', marginBottom: '8px' }}>Attention Check</h2>
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
            {feedback && <p style={{ color: '#e74c3c', marginTop: '16px', fontWeight: 600 }}>❌ {feedback}</p>}
          </div>
        </div>
      )}

      {showEmpatheticChoice && (
        <div className="cognify-overlay">
          <div className="cognify-quiz-card" style={{ border: '3px solid #4b0082' }}>
            <Brain size={45} color="#4b0082" style={{ marginBottom: '12px' }} />
            <h2 style={{ color: '#4b0082' }}>Let me help</h2>
            <div style={{ display: 'flex', gap: '16px', justifyContent: 'center', flexWrap: 'wrap', marginTop: '24px' }}>
              <button onClick={handleDistractedChoice} className="cognify-btn-secondary" style={{ padding: '16px 24px' }}>😅 Distracted</button>
              <button onClick={handleDidntUnderstand} className="cognify-btn-primary" style={{ padding: '16px 24px' }}>🤔 Didn't understand</button>
            </div>
          </div>
        </div>
      )}

      {showCheckIn && (
        <div className="cognify-overlay">
          <div className="cognify-quiz-card" style={{ border: '3px solid #2ecc71' }}>
            <Brain size={45} color="#2ecc71" style={{ marginBottom: '12px' }} />
            <h2 style={{ color: '#2ecc71' }}>Quick Check-In</h2>
            <div style={{ display: 'flex', gap: '16px', justifyContent: 'center', flexWrap: 'wrap', marginTop: '24px' }}>
              <button onClick={handleCheckInUnderstood} className="cognify-btn-success" style={{ padding: '16px 24px' }}>✅ Got it (+5)</button>
              <button onClick={handleCheckInConfused} className="cognify-btn-primary" style={{ padding: '16px 24px' }}>🤔 Explain</button>
            </div>
          </div>
        </div>
      )}

      {showReframe && (
        <div className="cognify-overlay">
          <div style={{ maxWidth: '700px', width: '100%', maxHeight: '90vh', overflowY: 'auto' }}>
            <div className="cognify-quiz-card" style={{ border: '3px solid #4b0082', marginBottom: '20px' }}>
              <Brain size={40} color="#4b0082" style={{ marginBottom: '10px' }} />
              <h2 style={{ color: '#4b0082' }}>Simplified Explanation</h2>
              {isReframing ? <p style={{ color: '#888' }}>Generating...</p> : <p style={{ fontSize: '17px', lineHeight: 1.8, color: '#333', textAlign: 'left' }}>{reframeText}</p>}
            </div>
            {(isSearchingVideos || youtubeVideos.length > 0) && (
              <div className="cognify-quiz-card" style={{ border: '3px solid #e74c3c' }}>
                <PlayCircle size={35} color="#e74c3c" style={{ marginBottom: '10px' }} />
                <h3 style={{ color: '#e74c3c', marginBottom: '20px' }}>Tutorials</h3>
                {isSearchingVideos ? <p>Searching...</p> : youtubeVideos.map((v, i) => (
                  <a key={i} href={`https://www.youtube.com/watch?v=${v.videoId}`} target="_blank" rel="noopener noreferrer"
                    className="cognify-video-card" style={{ display: 'flex', gap: '12px', padding: '12px', textDecoration: 'none', color: 'inherit', marginBottom: '8px' }}>
                    <img src={v.thumbnail} alt="" style={{ width: '140px', height: '80px', borderRadius: '8px', objectFit: 'cover' }} />
                    <p style={{ fontWeight: 600, fontSize: '14px', margin: 0 }}>{v.title}</p>
                  </a>
                ))}
              </div>
            )}
            <div style={{ textAlign: 'center', marginTop: '20px' }}>
              <button onClick={handleCloseReframe} className="cognify-btn-success" style={{ padding: '14px 40px' }}>✅ Resume</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ListenMode;