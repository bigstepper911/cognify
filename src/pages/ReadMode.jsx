import React, { useState, useEffect, useRef } from 'react';
import Webcam from 'react-webcam';
import { AlertTriangle, ArrowLeft, BookOpenText, PlayCircle } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { generatePopQuiz, gradeAnswer } from '../utils/gemini'; 
import * as tf from '@tensorflow/tfjs';
import * as blazeface from '@tensorflow-models/blazeface';

// --- NEW IMPORTS FOR CLOUD DATABASE ---
import { auth } from '../firebase';
import { loadUserData, saveFocusCoins } from '../utils/db';

const ReadMode = () => {
  const navigate = useNavigate();
  const webcamRef = useRef(null);
  
  // -- Active Session State --
  const [isDistracted, setIsDistracted] = useState(false);
  const [focusCoins, setFocusCoins] = useState(0);
  const [isVisionLoaded, setIsVisionLoaded] = useState(false);

  // Pull real text from the PDF you uploaded!
  const savedText = localStorage.getItem("cognify_learning_text");
  const currentParagraph = savedText || "Please go back to the home screen and upload a PDF first!";
  const [currentTopic] = useState("Your Custom Document");

  // -- AI Quiz State --
  const [quizQuestion, setQuizQuestion] = useState("");
  const [userAnswer, setUserAnswer] = useState("");
  const [loadingStatus, setLoadingStatus] = useState(""); 
  const [feedback, setFeedback] = useState("");
  const [failureCount, setFailureCount] = useState(0);

  // -- JIT Video Fallback State --
  const [showVideoFallback, setShowVideoFallback] = useState(false);
  const videoId = "Db9ZYchREPE"; 

  // --- 🪙 CLOUD DATABASE: LOAD COINS ON START ---
  useEffect(() => {
    const fetchCoins = async () => {
      if (auth.currentUser) {
        const data = await loadUserData(auth.currentUser.uid);
        setFocusCoins(data.focusCoins); // Set their real balance!
      }
    };
    fetchCoins();
  }, []);

  // --- TRIGGER DISTRACTION FUNCTION ---
  const triggerDistraction = async () => {
    setIsDistracted(true);
    setLoadingStatus("generating");
    setFeedback("");
    setUserAnswer("");
    
    const question = await generatePopQuiz(currentParagraph);
    setQuizQuestion(question);
    setLoadingStatus("");
  };

  // 1. Tab-Switching Detection
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.hidden && !isDistracted && !showVideoFallback) {
        triggerDistraction();
      }
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, [isDistracted, showVideoFallback]);

  // 2. REAL COMPUTER VISION (Webcam Face Tracking)
  useEffect(() => {
    let runInterval;
    const runFaceDetection = async () => {
      const model = await blazeface.load();
      setIsVisionLoaded(true);
      
      runInterval = setInterval(async () => {
        // If we are already in a quiz/video, pause the camera check
        if (isDistracted || showVideoFallback) return;

        if (
          webcamRef.current !== null &&
          webcamRef.current.video.readyState === 4
        ) {
          const video = webcamRef.current.video;
          const predictions = await model.estimateFaces(video, false);
          
          // If no face is found (student looked away or left), trigger AI!
          if (predictions.length === 0) {
            console.log("No face detected! Triggering distraction mode...");
            triggerDistraction();
          }
        }
      }, 2000); // Check every 2 seconds
    };

    runFaceDetection();
    return () => clearInterval(runInterval);
  }, [isDistracted, showVideoFallback]);


  // -- The AI Grading Function --
  const handleSubmitAnswer = async () => {
    if (!userAnswer.trim()) return;
    
    setLoadingStatus("grading");
    const result = await gradeAnswer(quizQuestion, userAnswer);
    
    if (result.startsWith("CORRECT")) {
      // 1. Calculate new total
      const newTotal = focusCoins + 10;
      setFocusCoins(newTotal); // Update screen instantly
      
      // 2. DEPOSIT TO THE CLOUD!
      if (auth.currentUser) {
        await saveFocusCoins(auth.currentUser.uid, newTotal);
      }

      setIsDistracted(false); 
      setLoadingStatus("");
      setFailureCount(0); 
    } else {
      setLoadingStatus("");
      setFeedback(result); 
      
      const newFailureCount = failureCount + 1;
      setFailureCount(newFailureCount);
      
      if (newFailureCount >= 2) {
        setIsDistracted(false); 
        setShowVideoFallback(true); 
      }
    }
  };

  const handleCloseVideo = () => {
    setShowVideoFallback(false);
    setFailureCount(0); 
  };

  return (
    <div style={{ padding: '30px', fontFamily: 'sans-serif', backgroundColor: '#f4f4f9', minHeight: '100vh' }}>
      
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <button onClick={() => navigate('/')} style={btnStyle}>
          <ArrowLeft size={18} style={{ marginRight: '5px' }} /> Back to Home
        </button>
        <h2 style={{ color: '#4b0082', margin: 0 }}>📖 Cognify Read Mode</h2>
        <div style={{ display: 'flex', gap: '15px' }}>
          <div style={{ padding: '10px 15px', backgroundColor: '#ffd700', color: '#333', borderRadius: '8px', fontWeight: 'bold' }}>
            🪙 {focusCoins} Focus Coins
          </div>
          <div style={{ padding: '10px 15px', backgroundColor: isDistracted ? 'red' : showVideoFallback ? '#e67e22' : 'green', color: 'white', borderRadius: '8px', fontWeight: 'bold' }}>
            {isDistracted ? 'STATUS: DISTRACTED' : showVideoFallback ? 'STATUS: REMEDIATION' : 'STATUS: FOCUSED'}
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: '30px' }}>
        
        {/* Main Document Content */}
        <div style={{ flex: 2, backgroundColor: 'white', padding: '30px', borderRadius: '12px', position: 'relative' }}>
          <div style={{ filter: isDistracted || showVideoFallback ? 'blur(4px)' : 'none', transition: '0.3s' }}>
            <h3 style={{ borderBottom: '2px solid #ddd', paddingBottom: '10px' }}>{currentTopic}</h3>
            <p style={{ lineHeight: '1.9', color: '#333', fontSize: '1.1rem' }}>{currentParagraph}</p>
          </div>

          {/* JIT Video UI */}
          {showVideoFallback && (
            <div style={overlayStyle}>
              <div style={{ textAlign: 'center', color: 'white' }}>
                <PlayCircle size={60} color="#ff0000" style={{ marginBottom: '15px' }} />
                <h2 style={{ fontSize: '2rem' }}>Just-In-Time Remediation</h2>
                <p style={{ fontSize: '1.2rem', margin: '15px 0 30px 0' }}>You struggled with the recall quiz. Please review this video before continuing.</p>
                <div style={{ borderRadius: '12px', overflow: 'hidden', border: '5px solid #ff0000', display: 'inline-block' }}>
                  <iframe width="640" height="360" src={`https://www.youtube.com/embed/${videoId}?autoplay=1`} title="JIT Video" frameBorder="0" allowFullScreen></iframe>
                </div>
                <div style={{ marginTop: '30px' }}>
                  <button onClick={handleCloseVideo} style={{ ...btnStyle, backgroundColor: '#ff0000', color: 'white', padding: '12px 24px' }}>Close Video & Resume</button>
                </div>
              </div>
            </div>
          )}

          {/* AI Quiz UI */}
          {isDistracted && !showVideoFallback && (
            <div style={{ ...overlayStyle, backgroundColor: 'rgba(255, 230, 230, 0.97)' }}>
              <div style={{ backgroundColor: '#fff', padding: '30px', borderRadius: '12px', border: '4px solid red', width: '80%' }}>
                <div style={{ display: 'flex', alignItems: 'center', color: 'red', marginBottom: '20px' }}>
                  <AlertTriangle size={35} style={{ marginRight: '15px' }} />
                  <strong style={{ fontSize: '22px' }}>SESSION PAUSED: YOU LOOKED AWAY!</strong>
                </div>
                <h4 style={{ color: '#4b0082' }}>🧠 AI Active Recall Check based on your PDF:</h4>
                <p style={{ fontSize: '18px', fontWeight: 'bold', margin: '15px 0' }}>
                  {loadingStatus === "generating" ? "Generating mandatory pop-quiz..." : quizQuestion}
                </p>
                
                {!loadingStatus && (
                  <div style={{ marginTop: '20px' }}>
                    <input type="text" value={userAnswer} onChange={(e) => setUserAnswer(e.target.value)} placeholder="Type your answer..." style={{ padding: '12px', width: '65%', marginRight: '15px', borderRadius: '8px', border: '1px solid #ccc' }} />
                    <button onClick={handleSubmitAnswer} style={{ ...btnStyle, backgroundColor: '#4b0082', color: 'white', padding: '12px 24px' }}>Submit Answer</button>
                  </div>
                )}
                {feedback && <p style={{ color: 'red', marginTop: '20px', fontWeight: 'bold' }}>❌ {feedback} <br/><em>(Failures: {failureCount}/2)</em></p>}
              </div>
            </div>
          )}
        </div>

        {/* Right Side: Visual Tracker */}
        <div style={{ flex: 1 }}>
          <div style={{ backgroundColor: 'white', padding: '20px', borderRadius: '12px', textAlign: 'center', border: '2px solid #ddd' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#4b0082', marginBottom: '15px' }}>
                <BookOpenText size={20} style={{marginRight: '8px'}}/>
                <h4 style={{ margin: 0 }}>Live AI Vision Tracker</h4>
            </div>
            {!isVisionLoaded && <p style={{ color: 'gray', fontSize: '12px' }}>Loading Google AI Vision Model...</p>}
            <Webcam ref={webcamRef} audio={false} width="100%" style={{ borderRadius: '8px', border: isVisionLoaded ? '4px solid #4caf50' : '2px solid #ccc', transform: 'scaleX(-1)' }} />
            {isVisionLoaded && <p style={{ color: '#4caf50', fontWeight: 'bold', marginTop: '10px' }}>🟢 Face Detected & Tracking</p>}
          </div>
        </div>
      </div>
    </div>
  );
};

const btnStyle = { padding: '8px 16px', fontSize: '14px', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', backgroundColor: '#ccc', border: 'none', borderRadius: '6px' };
const overlayStyle = { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: '#000000ee', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10, padding: '20px' };

export default ReadMode;