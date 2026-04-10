import React, { useEffect, useState, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import * as pdfjsLib from 'pdfjs-dist';
import { Mic, FileText, ArrowLeft, Brain, CheckCircle } from 'lucide-react';
import { generatePopQuiz, gradeAnswer, reframeContent } from '../utils/gemini';
import { auth } from '../firebase';
import { loadUserData, saveFocusCoins } from '../utils/db';

pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;

const VoiceNavigator = () => {
  const navigate = useNavigate();
  const fileInputRef = useRef(null);
  const speechSynthRef = useRef(window.speechSynthesis);

  // -- Core State --
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [status, setStatus] = useState("waiting"); // waiting, uploaded, reading, quiz, reframe, done
  const [statusMessage, setStatusMessage] = useState("Press spacebar to upload a PDF");
  const [focusCoins, setFocusCoins] = useState(0);

  // -- Paragraphs --
  const [paragraphs, setParagraphs] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);

  // -- Quiz --
  const [quizQuestion, setQuizQuestion] = useState("");
  const [quizAttempts, setQuizAttempts] = useState(0);

  // -- Check-in tracking --
  const [checkInCount, setCheckInCount] = useState(0);

  // =============================================
  // SPEAK ENGINE
  // =============================================
  const speak = useCallback((text, onEnd) => {
    speechSynthRef.current.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 0.95;
    utterance.pitch = 1;
    utterance.onstart = () => setIsSpeaking(true);
    utterance.onend = () => {
      setIsSpeaking(false);
      if (onEnd) onEnd();
    };
    speechSynthRef.current.speak(utterance);
  }, []);

  // =============================================
  // LISTEN ENGINE (One-shot voice input)
  // =============================================
  const listenForResponse = useCallback(() => {
    return new Promise((resolve) => {
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (!SpeechRecognition) { resolve(""); return; }

      const recognition = new SpeechRecognition();
      recognition.continuous = false;
      recognition.interimResults = false;
      recognition.lang = 'en-US';

      recognition.onresult = (event) => {
        const transcript = event.results[0][0].transcript.toLowerCase().trim();
        resolve(transcript);
      };
      recognition.onerror = () => resolve("");
      recognition.onend = () => {}; // handled by onresult
      
      // Small delay so TTS finishes before mic opens
      setTimeout(() => {
        try { recognition.start(); } catch (e) { resolve(""); }
      }, 500);
    });
  }, []);

  // =============================================
  // LOAD COINS
  // =============================================
  useEffect(() => {
    const fetchCoins = async () => {
      if (auth.currentUser) {
        const data = await loadUserData(auth.currentUser.uid);
        setFocusCoins(data.focusCoins);
      }
    };
    fetchCoins();
  }, []);

  // =============================================
  // WELCOME MESSAGE
  // =============================================
  useEffect(() => {
    speak("Voice Navigator activated. This is a fully hands-free learning experience. Press the spacebar to upload a P D F document. Or say upload.");
    return () => speechSynthRef.current.cancel();
  }, [speak]);

  // =============================================
  // KEYBOARD: SPACEBAR TO UPLOAD
  // =============================================
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.code === 'Space' && status === 'waiting') {
        e.preventDefault();
        openFileUpload();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [status]);

  // =============================================
  // ALWAYS-ON VOICE COMMANDS
  // =============================================
  useEffect(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) return;

    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = false;
    recognition.lang = 'en-US';

    recognition.onresult = (event) => {
      const last = event.results[event.results.length - 1];
      const command = last[0].transcript.toLowerCase().trim();

      if (status === 'waiting' && command.includes("upload")) {
        openFileUpload();
      } else if (command.includes("go back") || command.includes("home") || command.includes("exit")) {
        speechSynthRef.current.cancel();
        navigate('/');
      }
    };

    recognition.onend = () => {
      try { recognition.start(); } catch (e) {}
    };

    try { recognition.start(); } catch (e) {}
    return () => { try { recognition.stop(); } catch (e) {} };
  }, [status, navigate]);

  // =============================================
  // FILE UPLOAD
  // =============================================
  const openFileUpload = () => {
    speak("Opening file browser. Please select your document.");
    setTimeout(() => {
      if (fileInputRef.current) fileInputRef.current.click();
    }, 1500);
  };

  const handleFileUpload = async (event) => {
    const file = event.target.files[0];
    if (!file || file.type !== "application/pdf") {
      speak("Invalid file. Please upload a P D F.");
      return;
    }

    setStatus("uploaded");
    setStatusMessage("Scanning document...");
    speak("Scanning document. Please wait.");

    const reader = new FileReader();
    reader.onload = async function () {
      const typedarray = new Uint8Array(this.result);
      try {
        const pdf = await pdfjsLib.getDocument(typedarray).promise;
        let fullText = "";

        for (let i = 1; i <= pdf.numPages; i++) {
          const page = await pdf.getPage(i);
          const textContent = await page.getTextContent();
          const pageText = textContent.items.map(item => item.str).join(" ");
          fullText += pageText + "\n\n";
        }

        const chunks = fullText.split(/\n\n+/).map(p => p.trim()).filter(p => p.length > 30);
        setParagraphs(chunks);
        localStorage.setItem("cognify_learning_text", fullText.trim());
        localStorage.setItem("cognify_paragraphs", JSON.stringify(chunks));

        setStatusMessage(`Document loaded! ${pdf.numPages} pages, ${chunks.length} sections.`);
        speak(`Document scanned successfully. ${pdf.numPages} pages found with ${chunks.length} learning sections. Starting your audio lesson now.`, () => {
          startReadingLoop(chunks, 0);
        });
      } catch (error) {
        speak("Error reading document. Please try again.");
      }
    };
    reader.readAsArrayBuffer(file);
  };

  // =============================================
  // THE MAIN READING LOOP (Fully Voice-Driven)
  // =============================================
  const startReadingLoop = async (chunks, index) => {
    if (index >= chunks.length) {
      setStatus("done");
      setStatusMessage("You've completed all sections!");
      speak(`Congratulations! You have completed all ${chunks.length} sections. You earned ${focusCoins} focus coins total. Great job! Say go back to return to the dashboard.`);
      return;
    }

    setCurrentIndex(index);
    setStatus("reading");
    setStatusMessage(`Reading section ${index + 1} of ${chunks.length}`);

    // Read the paragraph
    await new Promise((resolve) => {
      speak(`Section ${index + 1}. ${chunks[index]}`, resolve);
    });

    // Proactive check-in every 2 paragraphs
    if ((index + 1) % 2 === 0) {
      setCheckInCount(prev => prev + 1);
      setStatus("quiz");
      setStatusMessage("Check-in: Did you understand?");

      await new Promise((resolve) => {
        speak("Quick check. Did you understand that section? Say yes or no.", resolve);
      });

      const response = await listenForResponse();

      if (response.includes("no") || response.includes("confused") || response.includes("don't")) {
        // Trigger reframe
        setStatus("reframe");
        setStatusMessage("Generating simpler explanation...");
        speak("Let me explain it differently.");

        const reframe = await reframeContent(chunks[index]);
        await new Promise((resolve) => {
          speak(reframe, resolve);
        });

        // Award coins and move on
        const newTotal = focusCoins + 5;
        setFocusCoins(newTotal);
        if (auth.currentUser) await saveFocusCoins(auth.currentUser.uid, newTotal);

        startReadingLoop(chunks, index + 1);
      } else {
        // Understood — award coins and continue
        const newTotal = focusCoins + 5;
        setFocusCoins(newTotal);
        if (auth.currentUser) await saveFocusCoins(auth.currentUser.uid, newTotal);

        speak("Great! Moving to the next section.", () => {
          startReadingLoop(chunks, index + 1);
        });
      }
    } else {
      // No check-in — just move to next
      startReadingLoop(chunks, index + 1);
    }
  };

  // =============================================
  // RENDER
  // =============================================
  const progressPercent = paragraphs.length > 0 ? Math.round(((currentIndex + 1) / paragraphs.length) * 100) : 0;

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      minHeight: '100vh', fontFamily: "'Inter', sans-serif", padding: '40px', textAlign: 'center'
    }}>

      {/* Back Button */}
      <button onClick={() => { speechSynthRef.current.cancel(); navigate('/'); }}
        className="cognify-btn-secondary" style={{ position: 'absolute', top: '20px', left: '20px' }}>
        <ArrowLeft size={18} /> Back
      </button>

      {/* Focus Coins */}
      <div className="cognify-coins" style={{ position: 'absolute', top: '20px', right: '20px' }}>
        🪙 {focusCoins}
      </div>

      {/* Hidden File Input */}
      <input type="file" accept=".pdf" ref={fileInputRef} onChange={handleFileUpload} style={{ display: 'none' }} />

      {/* Title */}
      <h1 style={{ color: '#4b0082', fontSize: '36px', marginBottom: '8px' }}>Voice Navigator</h1>
      <p style={{ color: '#888', fontSize: '16px', marginBottom: '40px' }}>100% Accessible — Hands-Free Learning</p>

      {/* Animated Mic */}
      <div className={isSpeaking ? 'pulse-glow' : ''} style={{
        width: '160px', height: '160px', borderRadius: '50%',
        background: isSpeaking ? 'linear-gradient(135deg, #2ecc71, #27ae60)' : status === 'done' ? 'linear-gradient(135deg, #ffd700, #ffb800)' : 'linear-gradient(135deg, #4b0082, #6a1b9a)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        margin: '0 auto 30px', transition: 'all 0.5s ease',
        boxShadow: isSpeaking ? '0 0 50px rgba(46, 204, 113, 0.4)' : '0 0 30px rgba(75, 0, 130, 0.2)'
      }}>
        {status === 'done' ? <CheckCircle size={70} color="white" /> :
         status === 'reframe' ? <Brain size={70} color="white" /> :
         <Mic size={70} color="white" />}
      </div>

      {/* Status */}
      <div className="cognify-card" style={{ maxWidth: '500px', width: '100%', padding: '24px' }}>
        <div className={`cognify-status ${status === 'reading' ? 'focused' : status === 'quiz' ? 'distracted' : 'remediation'}`}
          style={{ marginBottom: '16px', display: 'inline-block' }}>
          {status.toUpperCase()}
        </div>
        <p style={{ fontSize: '18px', fontWeight: 600, color: '#1a1a2e', marginBottom: '8px' }}>{statusMessage}</p>

        {paragraphs.length > 0 && (
          <>
            <div className="cognify-focus-bar" style={{ margin: '16px 0' }}>
              <div className="cognify-focus-fill" style={{ width: `${progressPercent}%`, backgroundColor: '#4b0082' }} />
            </div>
            <p style={{ fontSize: '13px', color: '#999' }}>
              Section {currentIndex + 1} of {paragraphs.length} • {progressPercent}% complete • {checkInCount} check-ins
            </p>
          </>
        )}

        {status === 'waiting' && (
          <p style={{ fontSize: '14px', color: '#aaa', marginTop: '16px' }}>
            Press <span style={{ backgroundColor: '#4b0082', color: 'white', padding: '4px 12px', borderRadius: '6px', fontWeight: 600 }}>Spacebar</span> or say "Upload"
          </p>
        )}
      </div>

      {/* Instructions */}
      <div style={{ marginTop: '40px', maxWidth: '400px', width: '100%' }}>
        <div className="cognify-card" style={{ textAlign: 'left', fontSize: '13px', color: '#888', lineHeight: 2 }}>
          <h4 style={{ color: '#4b0082', marginBottom: '8px', fontSize: '14px' }}>Voice Commands</h4>
          <div><b>"Upload"</b> — open file browser</div>
          <div><b>"Yes" / "No"</b> — answer check-ins</div>
          <div><b>"Go back"</b> — return to dashboard</div>
        </div>
      </div>
    </div>
  );
};

export default VoiceNavigator;