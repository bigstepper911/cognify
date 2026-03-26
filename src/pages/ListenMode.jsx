import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Headphones, Mic, StopCircle, Play, AlertTriangle } from 'lucide-react';
import { generatePopQuiz, gradeAnswer } from '../utils/gemini';

// --- NEW IMPORTS FOR CLOUD DATABASE ---
import { auth } from '../firebase';
import { loadUserData, saveFocusCoins } from '../utils/db';

const ListenMode = () => {
  const navigate = useNavigate();
  
  // -- App State --
  const [focusCoins, setFocusCoins] = useState(0);
  const [isDistracted, setIsDistracted] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  
  // -- Real PDF Text --
  const savedText = localStorage.getItem("cognify_learning_text");
  const currentText = savedText || "Please go back to the home screen and upload a PDF first!";
  
  // -- AI & Voice State --
  const [quizQuestion, setQuizQuestion] = useState("");
  const [userAnswer, setUserAnswer] = useState("");
  const [feedback, setFeedback] = useState("");
  const [isListening, setIsListening] = useState(false);
  const [loadingStatus, setLoadingStatus] = useState("");

  const speechSynthRef = useRef(window.speechSynthesis);

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

  // --- TEXT TO SPEECH (Reading the PDF) ---
  const togglePlay = () => {
    if (isPlaying) {
      speechSynthRef.current.cancel();
      setIsPlaying(false);
    } else {
      const utterance = new SpeechSynthesisUtterance(currentText);
      utterance.rate = 0.9; // Slightly slower for learning
      utterance.onend = () => setIsPlaying(false);
      speechSynthRef.current.speak(utterance);
      setIsPlaying(true);
    }
  };

  // --- TRIGGER DISTRACTION ---
  const triggerDistraction = async () => {
    setIsDistracted(true);
    if (isPlaying) {
      speechSynthRef.current.cancel(); // Stop reading the book
      setIsPlaying(false);
    }
    
    setLoadingStatus("Generating audio quiz...");
    setFeedback("");
    setUserAnswer("");
    
    // Fetch secure quiz from your Node.js backend
    const question = await generatePopQuiz(currentText);
    setQuizQuestion(question);
    setLoadingStatus("");

    // Read the pop quiz out loud!
    const alertSpeech = new SpeechSynthesisUtterance("Attention check! " + question);
    speechSynthRef.current.speak(alertSpeech);
  };

  // Tab-Switching Detection (Blind students might not use a webcam, so we rely on tabs)
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.hidden && !isDistracted) {
        triggerDistraction();
      }
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, [isDistracted, isPlaying]);

  // --- SPEECH TO TEXT (Listening to the Student's Answer) ---
  const startListening = () => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      alert("Your browser does not support Voice Input. Please type your answer.");
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.lang = 'en-US';

    recognition.onstart = () => setIsListening(true);
    
    recognition.onresult = (event) => {
      const transcript = event.results[0][0].transcript;
      setUserAnswer(transcript);
      setIsListening(false);
    };

    recognition.onerror = (event) => {
      console.error("Speech recognition error", event.error);
      setIsListening(false);
    };

    recognition.start();
  };

  // --- GRADING THE ANSWER & SAVING COINS ---
  const handleSubmitAnswer = async () => {
    if (!userAnswer.trim()) return;
    
    setLoadingStatus("Grading...");
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
      
      const successSpeech = new SpeechSynthesisUtterance("Correct! Great job. Resuming lecture.");
      speechSynthRef.current.speak(successSpeech);
    } else {
      setLoadingStatus("");
      setFeedback(result); 
      
      const failSpeech = new SpeechSynthesisUtterance("Incorrect. " + result);
      speechSynthRef.current.speak(failSpeech);
    }
  };

  // Cleanup speech if user leaves the page
  useEffect(() => {
    return () => speechSynthRef.current.cancel();
  }, []);

  return (
    <div style={{ padding: '30px', fontFamily: 'sans-serif', backgroundColor: '#f4f4f9', minHeight: '100vh' }}>
      
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '40px' }}>
        <button onClick={() => navigate('/')} style={btnStyle}>
          <ArrowLeft size={18} style={{ marginRight: '5px' }} /> Back
        </button>
        <h2 style={{ color: '#4b0082', margin: 0 }}>🎧 Listen Mode (Audio Learning)</h2>
        <div style={{ padding: '10px 15px', backgroundColor: '#ffd700', color: '#333', borderRadius: '8px', fontWeight: 'bold' }}>
          🪙 {focusCoins} Focus Coins
        </div>
      </div>

      <div style={{ textAlign: 'center', marginTop: '50px' }}>
        <Headphones size={80} color={isPlaying ? "#2ecc71" : "#4b0082"} style={{ marginBottom: '20px' }} />
        
        <h2>{isPlaying ? "Reading Document Aloud..." : "Audio Paused"}</h2>
        
        <button onClick={togglePlay} style={{ ...btnStyle, backgroundColor: isPlaying ? '#e74c3c' : '#2ecc71', color: 'white', padding: '15px 30px', fontSize: '18px', marginTop: '20px' }}>
          {isPlaying ? <><StopCircle size={24} style={{ marginRight: '10px' }}/> Stop Audio</> : <><Play size={24} style={{ marginRight: '10px' }}/> Play Document</>}
        </button>
      </div>

      {/* AI Quiz UI (Triggers on Tab Switch) */}
      {isDistracted && (
        <div style={overlayStyle}>
          <div style={{ backgroundColor: '#fff', padding: '40px', borderRadius: '12px', border: '4px solid red', width: '80%', textAlign: 'center' }}>
            <AlertTriangle size={50} color="red" style={{ marginBottom: '15px' }} />
            <h2 style={{ color: 'red' }}>Audio Paused: Attention Check</h2>
            
            <p style={{ fontSize: '22px', fontWeight: 'bold', margin: '20px 0' }}>
              {loadingStatus || quizQuestion}
            </p>
            
            {!loadingStatus && (
              <div style={{ marginTop: '30px' }}>
                <div style={{ display: 'flex', justifyContent: 'center', gap: '15px', marginBottom: '20px' }}>
                  <input type="text" value={userAnswer} onChange={(e) => setUserAnswer(e.target.value)} placeholder="Type or speak your answer..." style={{ padding: '15px', width: '60%', borderRadius: '8px', border: '2px solid #ccc', fontSize: '16px' }} />
                  
                  <button onClick={startListening} style={{ ...btnStyle, backgroundColor: isListening ? '#e74c3c' : '#3498db', color: 'white', padding: '15px' }}>
                    <Mic size={24} color="white" /> {isListening ? "Listening..." : "Speak"}
                  </button>
                </div>

                <button onClick={handleSubmitAnswer} style={{ ...btnStyle, backgroundColor: '#4b0082', color: 'white', padding: '15px 40px', fontSize: '18px' }}>Submit Answer</button>
              </div>
            )}
            
            {feedback && <p style={{ color: 'red', marginTop: '20px', fontSize: '18px', fontWeight: 'bold' }}>❌ {feedback}</p>}
          </div>
        </div>
      )}
    </div>
  );
};

const btnStyle = { fontSize: '16px', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', backgroundColor: '#ccc', border: 'none', borderRadius: '8px', transition: '0.3s' };
const overlayStyle = { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: '#000000ee', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10 };

export default ListenMode;