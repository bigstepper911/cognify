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

  const paragraphs = JSON.parse(localStorage.getItem("cognify_paragraphs") || "[]");
  const summary = localStorage.getItem("cognify_summary") || "";
  const [currentIndex, setCurrentIndex] = useState(0);
  const [readingMode, setReadingMode] = useState("full");
  const currentParagraph = paragraphs[currentIndex] || "Please go back and upload a PDF first!";

  const [isPlaying, setIsPlaying] = useState(false);
  const [autoPlay, setAutoPlay] = useState(false);
  const [focusCoins, setFocusCoins] = useState(0);

  const [isDistracted, setIsDistracted] = useState(false);
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

  const [isVoiceActive, setIsVoiceActive] = useState(false);
  const [lastVoiceCommand, setLastVoiceCommand] = useState("");
  const voiceRecognitionRef = useRef(null);

  const { isBlindMode } = useUser();

  useEffect(() => {
    const fetchCoins = async () => {
      if (auth.currentUser) {
        const data = await loadUserData(auth.currentUser.uid);
        setFocusCoins(data.focusCoins);
      }
    };
    fetchCoins();
  }, []);

  const speakText = useCallback((text, onEnd) => {
    speechSynthRef.current.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 0.9;
    utterance.pitch = 1;
    utterance.onstart = () => setIsPlaying(true);
    utterance.onend = () => {
      setIsPlaying(false);
      if (onEnd) onEnd();
    };
    speechSynthRef.current.speak(utterance);
  }, []);

  const speakCurrentParagraph = useCallback(() => {
    const text = readingMode === "summary" && summary
      ? `Summary mode. ${summary}`
      : `Section ${currentIndex + 1}. ${currentParagraph}`;

    speakText(text, () => {
      if (autoPlay && currentIndex < paragraphs.length - 1) {
        if ((currentIndex + 1) % 2 === 0) {
          triggerCheckIn();
        } else {
          setCurrentIndex(prev => prev + 1);
        }
      }
    });
  }, [currentIndex, currentParagraph, readingMode, summary, autoPlay, speakText]);

  const togglePlay = () => {
    if (isPlaying) {
      speechSynthRef.current.cancel();
      setIsPlaying(false);
      setAutoPlay(false);
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
    return () => speechSynthRef.current.cancel();
  }, []);

  const goNext = useCallback(() => {
    if (currentIndex < paragraphs.length - 1) {
      speechSynthRef.current.cancel();
      setIsPlaying(false);
      setCurrentIndex(prev => prev + 1);
    }
  }, [currentIndex, paragraphs.length]);

  const goPrev = useCallback(() => {
    if (currentIndex > 0) {
      speechSynthRef.current.cancel();
      setIsPlaying(false);
      setCurrentIndex(prev => prev - 1);
    }
  }, [currentIndex]);

  const repeatCurrent = useCallback(() => {
    speakCurrentParagraph();
  }, [speakCurrentParagraph]);

  const triggerDistraction = useCallback(async () => {
    if (isDistracted || showCheckIn || showReframe || showEmpatheticChoice) return;

    setIsDistracted(true);
    speechSynthRef.current.cancel();
    setIsPlaying(false);
    setAutoPlay(false);
    setLoadingStatus("generating");
    setFeedback("");
    setUserAnswer("");
    setShowEmpatheticChoice(false);

    const question = await generatePopQuiz(currentParagraph);
    setQuizQuestion(question);
    setLoadingStatus("");

    const alertSpeech = new SpeechSynthesisUtterance("Attention check! " + question);
    speechSynthRef.current.speak(alertSpeech);
  }, [isDistracted, showCheckIn, showReframe, showEmpatheticChoice, currentParagraph]);

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.hidden && !isDistracted && !showCheckIn && !showReframe) {
        triggerDistraction();
      }
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, [isDistracted, showCheckIn, showReframe, triggerDistraction]);

  const triggerCheckIn = useCallback(() => {
    setShowCheckIn(true);
    setCheckInCount(prev => prev + 1);
    speechSynthRef.current.cancel();
    setIsPlaying(false);
    speakText("Quick check. Did you understand that section, or should I explain it differently? Say yes or no.");
  }, [speakText]);

  const handleCheckInUnderstood = () => {
    setShowCheckIn(false);
    const newTotal = focusCoins + 5;
    setFocusCoins(newTotal);
    if (auth.currentUser) saveFocusCoins(auth.currentUser.uid, newTotal);
    speakText("Great job! Moving on.", () => {
      if (currentIndex < paragraphs.length - 1) {
        setCurrentIndex(prev => prev + 1);
      }
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
    const firstSentence = currentParagraph.split('.')[0];
    const videos = await searchYouTube(firstSentence);
    setYoutubeVideos(videos);
    setIsSearchingVideos(false);
  };

  const handleSubmitAnswer = async () => {
    if (!userAnswer.trim()) return;

    setLoadingStatus("grading");
    const result = await gradeAnswer(quizQuestion, userAnswer);

    if (result.startsWith("CORRECT")) {
      const newTotal = focusCoins + 10;
      setFocusCoins(newTotal);
      if (auth.currentUser) await saveFocusCoins(auth.currentUser.uid, newTotal);

      setIsDistracted(false);
      setLoadingStatus("");
      setFailureCount(0);
      speakText("Correct! Great focus. Resuming your audio session.");
    } else {
      setLoadingStatus("");
      setFeedback(result);
      const newFailureCount = failureCount + 1;
      setFailureCount(newFailureCount);

      if (newFailureCount >= 2) {
        setShowEmpatheticChoice(true);
        speakText("You seem to be struggling. Were you distracted, or did you not understand the material?");
      } else {
        speakText("Incorrect. " + result);
      }
    }
  };

  const handleDistractedChoice = () => {
    setShowEmpatheticChoice(false);
    setIsDistracted(false);
    setFailureCount(0);
    speakText("No worries! Let me repeat that section for you.", () => {
      repeatCurrent();
    });
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

  const handleCloseReframe = () => {
    setShowReframe(false);
    setReframeText("");
    setYoutubeVideos([]);
  };

  const startListeningForAnswer = () => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) { alert("Your browser does not support voice input."); return; }

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

      if (command.includes("next") || command.includes("skip") || command.includes("continue")) {
        goNext();
      } else if (command.includes("back") || command.includes("previous") || command.includes("repeat")) {
        if (command.includes("repeat")) {
          repeatCurrent();
        } else {
          goPrev();
        }
      } else if (command.includes("play") || command.includes("resume") || command.includes("start")) {
        if (!isPlaying) {
          setAutoPlay(true);
          speakCurrentParagraph();
        }
      } else if (command.includes("pause") || command.includes("stop")) {
        speechSynthRef.current.cancel();
        setIsPlaying(false);
        setAutoPlay(false);
      } else if (command.includes("summarize") || command.includes("summary")) {
        setReadingMode("summary");
        if (summary) {
          speakText("Switching to summary mode. " + summary);
        } else {
          speakText("No summary available. Please generate one from the home screen.");
        }
      } else if (command.includes("full") || command.includes("original") || command.includes("normal")) {
        setReadingMode("full");
        speakText("Switching to full notes mode.");
      } else if (command.includes("explain") || command.includes("help") || command.includes("don't understand")) {
        handleCheckInConfused();
      } else if (command.includes("yes") || command.includes("understood") || command.includes("got it")) {
        if (showCheckIn) handleCheckInUnderstood();
      } else if (command.includes("no") || command.includes("confused")) {
        if (showCheckIn) handleCheckInConfused();
      } else if (command.includes("distracted")) {
        if (showEmpatheticChoice) handleDistractedChoice();
      }
    };

    recognition.onerror = (e) => {
      if (e.error !== 'no-speech') {
        console.error("Voice command error:", e.error);
        setIsVoiceActive(false);
      }
    };

    recognition.onend = () => {
      setIsVoiceActive(false);
      // Debounce restart to prevent flicker
      setTimeout(() => {
        try { recognition.start(); } catch (e) {}
      }, 1000);
    };

    try { recognition.start(); } catch (e) {}
    voiceRecognitionRef.current = recognition;

    return () => {
      try { recognition.stop(); } catch (e) {}
    };
  }, [showCheckIn, showEmpatheticChoice]);

  const progressPercent = paragraphs.length > 0 ? Math.round(((currentIndex + 1) / paragraphs.length) * 100) : 0;

  return (
    <div style={{ padding: '24px', fontFamily: "'Inter', sans-serif", minHeight: '100vh' }}>

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

      <div style={{ margin: '0 0 24px 0' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', color: '#888', marginBottom: '6px' }}>
          <span>Section {currentIndex + 1} of {paragraphs.length}</span>
          <span>{progressPercent}% Complete</span>
        </div>
        <div className="cognify-focus-bar">
          <div className="cognify-focus-fill" style={{ width: `${progressPercent}%`, backgroundColor: '#4b0082' }} />
        </div>
      </div>

      <div style={{ display: 'flex', gap: '24px' }}>

        <div style={{ flex: 2.5 }}>
          <div className="cognify-card" style={{ textAlign: 'center', padding: '40px', position: 'relative' }}>

            <div className={isPlaying ? 'pulse-glow' : ''} style={{
              width: '140px', height: '140px', borderRadius: '50%',
              background: isPlaying ? 'linear-gradient(135deg, #2ecc71, #27ae60)' : 'linear-gradient(135deg, #4b0082, #6a1b9a)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              margin: '0 auto 30px', transition: 'all 0.5s ease',
              boxShadow: isPlaying ? '0 0 40px rgba(46, 204, 113, 0.3)' : '0 0 30px rgba(75, 0, 130, 0.2)'
            }}>
              <Headphones size={60} color="white" />
            </div>

            <h2 style={{ color: '#1a1a2e', marginBottom: '8px' }}>
              {isPlaying ? `Reading Section ${currentIndex + 1}...` : 'Audio Paused'}
            </h2>
            <p style={{ color: '#888', fontSize: '14px', marginBottom: '8px' }}>
              Mode: {readingMode === "summary" ? "📝 AI Summary" : "📄 Full Notes"}
            </p>

            <div style={{ display: 'flex', gap: '10px', justifyContent: 'center', marginBottom: '30px' }}>
              <button onClick={() => setReadingMode("full")}
                className={readingMode === "full" ? "cognify-btn-primary" : "cognify-btn-secondary"}
                style={{ padding: '8px 16px', fontSize: '13px' }}>
                Full Notes
              </button>
              <button onClick={() => { if (summary) setReadingMode("summary"); else alert("Generate summary from Home first!"); }}
                className={readingMode === "summary" ? "cognify-btn-primary" : "cognify-btn-secondary"}
                style={{ padding: '8px 16px', fontSize: '13px', opacity: summary ? 1 : 0.5 }}>
                AI Summary
              </button>
            </div>

            <div style={{ display: 'flex', gap: '16px', justifyContent: 'center', alignItems: 'center' }}>
              <button onClick={goPrev} disabled={currentIndex === 0} className="cognify-btn-secondary"
                style={{ borderRadius: '50%', width: '50px', height: '50px', padding: 0, justifyContent: 'center', opacity: currentIndex === 0 ? 0.4 : 1 }}>
                <SkipBack size={20} />
              </button>

              <button onClick={togglePlay} className={isPlaying ? "cognify-btn-danger" : "cognify-btn-success"}
                style={{ borderRadius: '50%', width: '70px', height: '70px', padding: 0, justifyContent: 'center', fontSize: '20px' }}>
                {isPlaying ? <Pause size={30} /> : <Play size={30} style={{ marginLeft: '3px' }} />}
              </button>

              <button onClick={goNext} disabled={currentIndex === paragraphs.length - 1} className="cognify-btn-secondary"
                style={{ borderRadius: '50%', width: '50px', height: '50px', padding: 0, justifyContent: 'center', opacity: currentIndex === paragraphs.length - 1 ? 0.4 : 1 }}>
                <SkipForward size={20} />
              </button>
            </div>

            <div style={{ marginTop: '30px', textAlign: 'left', padding: '20px', backgroundColor: '#f8f9fa', borderRadius: '12px', maxHeight: '200px', overflowY: 'auto' }}>
              <p style={{ fontSize: '13px', color: '#888', marginBottom: '8px', fontWeight: 600 }}>
                {readingMode === "summary" ? "📝 Summary Preview:" : `📄 Section ${currentIndex + 1}:`}
              </p>
              <p style={{ fontSize: '14px', lineHeight: 1.8, color: '#444' }}>
                {readingMode === "summary" && summary ? summary.substring(0, 500) + "..." : currentParagraph}
              </p>
            </div>
          </div>
        </div>

        <div style={{ flex: 1, minWidth: '280px' }}>

          <div className="cognify-card" style={{ marginBottom: '20px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
              <Mic size={18} color="#4b0082" />
              <h4 style={{ margin: 0, color: '#4b0082', fontSize: '14px' }}>Voice Commands</h4>
            </div>
            <div style={{ fontSize: '12px', color: isVoiceActive ? '#2ecc71' : '#999', fontWeight: 600, marginBottom: '10px' }}>
              {isVoiceActive ? '🟢 Listening...' : '🔴 Inactive'}
            </div>
            {lastVoiceCommand && (
              <div style={{ fontSize: '12px', color: '#888', padding: '8px', backgroundColor: '#f8f9fa', borderRadius: '8px', marginBottom: '10px' }}>
                Last: "{lastVoiceCommand}"
              </div>
            )}
            <div style={{ fontSize: '12px', color: '#aaa', lineHeight: 2 }}>
              <div><b>"Play"</b> / <b>"Pause"</b></div>
              <div><b>"Next"</b> / <b>"Previous"</b></div>
              <div><b>"Repeat"</b> — replay section</div>
              <div><b>"Summarize"</b> — switch to summary</div>
              <div><b>"Explain"</b> — get simpler version</div>
              <div><b>"Yes"</b> / <b>"No"</b> — answer check-ins</div>
            </div>
          </div>

          <div className="cognify-card" style={{ textAlign: 'center', marginBottom: '20px' }}>
            <h4 style={{ color: '#4b0082', marginBottom: '16px', fontSize: '14px' }}>Session Stats</h4>
            <div style={{ display: 'flex', justifyContent: 'space-around' }}>
              <div>
                <div style={{ fontSize: '28px', fontWeight: 800, color: '#4b0082' }}>{currentIndex + 1}</div>
                <div style={{ fontSize: '11px', color: '#888' }}>Sections Read</div>
              </div>
              <div>
                <div style={{ fontSize: '28px', fontWeight: 800, color: '#2ecc71' }}>{checkInCount}</div>
                <div style={{ fontSize: '11px', color: '#888' }}>Check-Ins</div>
              </div>
              <div>
                <div style={{ fontSize: '28px', fontWeight: 800, color: '#ffd700' }}>{focusCoins}</div>
                <div style={{ fontSize: '11px', color: '#888' }}>Coins</div>
              </div>
            </div>
          </div>

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

      {isDistracted && !showEmpatheticChoice && (
        <div className="cognify-overlay">
          <div className="cognify-quiz-card">
            <AlertTriangle size={45} color="#e74c3c" style={{ marginBottom: '12px' }} />
            <h2 style={{ color: '#e74c3c', marginBottom: '8px' }}>Audio Paused: Attention Check</h2>
            <p style={{ color: '#888', marginBottom: '24px' }}>Answer this to resume your audio session</p>

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

      {showCheckIn && (
        <div className="cognify-overlay">
          <div className="cognify-quiz-card" style={{ border: '3px solid #2ecc71' }}>
            <Brain size={45} color="#2ecc71" style={{ marginBottom: '12px' }} />
            <h2 style={{ color: '#2ecc71', marginBottom: '8px' }}>Quick Check-In</h2>
            <p style={{ color: '#666', marginBottom: '30px', fontSize: '18px' }}>
              Did you understand that section? Say "yes" or "no", or click below.
            </p>
            <div style={{ display: 'flex', gap: '16px', justifyContent: 'center', flexWrap: 'wrap' }}>
              <button onClick={handleCheckInUnderstood} className="cognify-btn-success" style={{ padding: '16px 28px', fontSize: '16px' }}>
                ✅ Yes, I got it! (+5 coins)
              </button>
              <button onClick={handleCheckInConfused} className="cognify-btn-primary" style={{ padding: '16px 28px', fontSize: '16px' }}>
                🤔 Explain differently
              </button>
            </div>
          </div>
        </div>
      )}

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
                <h3 style={{ color: '#e74c3c', marginBottom: '20px' }}>Recommended Tutorials</h3>
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
                ✅ I understand now — Resume Audio
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ListenMode;