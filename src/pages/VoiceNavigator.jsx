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

  const [isSpeaking, setIsSpeaking] = useState(false);
  const [status, setStatus] = useState("waiting");
  const [statusMessage, setStatusMessage] = useState("Press spacebar or say 'Upload' to begin");
  const [focusCoins, setFocusCoins] = useState(0);

  const [paragraphs, setParagraphs] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [checkInCount, setCheckInCount] = useState(0);
  const [lastHeard, setLastHeard] = useState("");

  const [isPaused, setIsPaused] = useState(false);
  const isPausedRef = useRef(false);

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

  // ===== SPEAK =====
  const speak = useCallback((text, onEnd) => {
    return new Promise((resolve) => {
      speechSynthRef.current.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = 0.95;
      utterance.pitch = 1;
      utterance.onstart = () => setIsSpeaking(true);
      utterance.onend = () => {
        setIsSpeaking(false);
        if (onEnd) onEnd();
        resolve();
      };
      utterance.onerror = () => {
        setIsSpeaking(false);
        resolve();
      };
      speechSynthRef.current.speak(utterance);
    });
  }, []);

  // ===== LISTEN ONCE =====
  const listenOnce = useCallback((prompt) => {
    return new Promise(async (resolve) => {
      if (prompt) await speak(prompt);
      await new Promise(r => setTimeout(r, 600));

      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (!SpeechRecognition) { resolve(""); return; }

      const recognition = new SpeechRecognition();
      recognition.continuous = false;
      recognition.interimResults = false;
      recognition.lang = 'en-US';

      let resolved = false;
      const timeout = setTimeout(() => {
        if (!resolved) { resolved = true; try { recognition.stop(); } catch(e) {} resolve(""); }
      }, 8000);

      recognition.onresult = (event) => {
        if (!resolved) {
          resolved = true;
          clearTimeout(timeout);
          const transcript = event.results[0][0].transcript.toLowerCase().trim();
          console.log("Voice heard:", transcript);
          setLastHeard(transcript);
          resolve(transcript);
        }
      };

      recognition.onerror = (e) => {
        if (!resolved) { resolved = true; clearTimeout(timeout); resolve(""); }
      };

      recognition.onend = () => {
        if (!resolved) { resolved = true; clearTimeout(timeout); resolve(""); }
      };

      try { recognition.start(); } catch(e) { resolve(""); }
    });
  }, [speak]);

  // ===== WELCOME =====
  useEffect(() => {
    speak("Voice Navigator activated. This is a fully hands-free learning experience. Press the spacebar to upload a document. Or say upload.");
    startBackgroundListener();
    return () => speechSynthRef.current.cancel();
  }, []);

  // ===== BACKGROUND LISTENER =====
  const startBackgroundListener = () => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) return;

    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = false;
    recognition.lang = 'en-US';

    recognition.onresult = (event) => {
      const last = event.results[event.results.length - 1];
      const command = last[0].transcript.toLowerCase().trim();
      console.log("BG command:", command);
      setLastHeard(command);

      // Pause handling
      if (command.includes("pause") || command.includes("stop")) {
        speechSynthRef.current.cancel();
        setIsSpeaking(false);
        setIsPaused(true);
        isPausedRef.current = true;
        setStatusMessage("Paused. Say 'resume' to continue.");
        setStatus("paused");
        return;
      }

      // Resume handling
      if (command.includes("resume") || command.includes("continue") || command.includes("play")) {
        if (isPausedRef.current) {
          setIsPaused(false);
          isPausedRef.current = false;
          try { recognition.stop(); } catch(e) {}
          readSection(paragraphs, currentIndex);
          return;
        }
      }

      if (isSpeaking) return;

      if (command.includes("upload") || command.includes("open")) {
        try { recognition.stop(); } catch(e) {}
        openFileUpload();
      } else if (command.includes("go back") || command.includes("home") || command.includes("exit")) {
        speechSynthRef.current.cancel();
        try { recognition.stop(); } catch(e) {}
        navigate('/');
      }
    };

    recognition.onerror = (e) => {
      if (e.error !== 'no-speech' && e.error !== 'aborted') {
        console.error("BG voice error:", e.error);
      }
    };

    recognition.onend = () => {
      setTimeout(() => {
        try { recognition.start(); } catch(e) {}
      }, 1500);
    };

    setTimeout(() => {
      try { recognition.start(); } catch(e) {}
    }, 3000);
  };

  // ===== SPACEBAR: Upload / Pause / Resume =====
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.code === 'Space') {
        e.preventDefault();
        if (status === 'waiting') {
          openFileUpload();
        } else if (isSpeaking) {
          speechSynthRef.current.cancel();
          setIsSpeaking(false);
          setIsPaused(true);
          isPausedRef.current = true;
          setStatusMessage("Paused. Press spacebar or say 'resume' to continue.");
          setStatus("paused");
        } else if (isPausedRef.current) {
          setIsPaused(false);
          isPausedRef.current = false;
          readSection(paragraphs, currentIndex);
        }
      } else if (e.code === 'Escape') {
        speechSynthRef.current.cancel();
        navigate('/');
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [status, isSpeaking, paragraphs, currentIndex]);

  // ===== FILE UPLOAD =====
  const openFileUpload = () => {
    speak("Opening file browser. Please select your document.");
    setTimeout(() => {
      if (fileInputRef.current) fileInputRef.current.click();
    }, 2000);
  };

  const handleFileUpload = async (event) => {
    const file = event.target.files[0];
    if (!file || file.type !== "application/pdf") {
      speak("Invalid file. Please upload a P D F.");
      return;
    }

    setStatus("uploaded");
    setStatusMessage("Scanning document...");
    await speak("Scanning document. Please wait.");

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

        setStatusMessage(`${pdf.numPages} pages, ${chunks.length} sections found.`);
        await speak(`Document scanned. ${pdf.numPages} pages with ${chunks.length} sections. Starting your audio lesson now. You can say pause or press spacebar anytime to pause.`);

        readSection(chunks, 0);
      } catch (error) {
        speak("Error reading document. Please try again.");
      }
    };
    reader.readAsArrayBuffer(file);
  };

  // ===== READING LOOP =====
  const readSection = async (chunks, index) => {
    // Check if paused
    if (isPausedRef.current) {
      setStatusMessage("Paused. Press spacebar or say 'resume'.");
      setStatus("paused");
      return;
    }

    if (index >= chunks.length) {
      setStatus("done");
      setStatusMessage("All sections complete!");
      await speak(`Congratulations! You completed all ${chunks.length} sections and earned ${focusCoins} focus coins. Say go back to return.`);
      const response = await listenOnce("Say go back when ready.");
      if (response.includes("back") || response.includes("home")) navigate('/');
      return;
    }

    setCurrentIndex(index);
    setStatus("reading");
    setStatusMessage(`Reading section ${index + 1} of ${chunks.length}`);

    await speak(`Section ${index + 1}. ${chunks[index]}`);

    // Check if paused during reading
    if (isPausedRef.current) return;

    // Check-in every 2 paragraphs
    if ((index + 1) % 2 === 0) {
      setCheckInCount(prev => prev + 1);
      setStatus("checkin");
      setStatusMessage("Check-in: Did you understand?");

      const response = await listenOnce("Did you understand that section? Say yes, no, or repeat.");

      if (isPausedRef.current) return;

      if (response.includes("no") || response.includes("confused") || response.includes("don't") || response.includes("didn't")) {
        setStatus("reframe");
        setStatusMessage("Explaining differently...");
        await speak("Let me explain it differently.");
        const reframe = await reframeContent(chunks[index]);
        await speak(reframe);
        const newTotal = focusCoins + 5;
        setFocusCoins(newTotal);
        if (auth.currentUser) await saveFocusCoins(auth.currentUser.uid, newTotal);
        await speak("Moving to the next section.");
        readSection(chunks, index + 1);
      } else if (response.includes("repeat") || response.includes("again")) {
        await speak("Repeating that section.");
        readSection(chunks, index);
      } else {
        const newTotal = focusCoins + 5;
        setFocusCoins(newTotal);
        if (auth.currentUser) await saveFocusCoins(auth.currentUser.uid, newTotal);
        await speak("Great! Moving on.");
        readSection(chunks, index + 1);
      }
    } else {
      // Between sections — ask for command
      setStatus("waiting-command");
      setStatusMessage("Listening for command...");

      const response = await listenOnce("Say next, repeat, explain, or pause.");

      if (isPausedRef.current) return;

      if (response.includes("repeat") || response.includes("again")) {
        readSection(chunks, index);
      } else if (response.includes("explain") || response.includes("help") || response.includes("simple")) {
        setStatus("reframe");
        setStatusMessage("Explaining simply...");
        const reframe = await reframeContent(chunks[index]);
        await speak(reframe);
        readSection(chunks, index + 1);
      } else if (response.includes("pause") || response.includes("stop")) {
        setIsPaused(true);
        isPausedRef.current = true;
        setStatus("paused");
        setStatusMessage("Paused. Say 'resume' or press spacebar.");
      } else if (response.includes("back") || response.includes("home")) {
        navigate('/');
      } else {
        readSection(chunks, index + 1);
      }
    }
  };

  // ===== RENDER =====
  const progressPercent = paragraphs.length > 0 ? Math.round(((currentIndex + 1) / paragraphs.length) * 100) : 0;

  const statusColors = {
    'waiting': { bg: 'linear-gradient(135deg, #4b0082, #6a1b9a)', icon: <Mic size={70} color="white" /> },
    'uploaded': { bg: 'linear-gradient(135deg, #3498db, #2980b9)', icon: <FileText size={70} color="white" /> },
    'reading': { bg: 'linear-gradient(135deg, #2ecc71, #27ae60)', icon: <Mic size={70} color="white" /> },
    'checkin': { bg: 'linear-gradient(135deg, #f39c12, #e67e22)', icon: <Brain size={70} color="white" /> },
    'reframe': { bg: 'linear-gradient(135deg, #9b59b6, #8e44ad)', icon: <Brain size={70} color="white" /> },
    'waiting-command': { bg: 'linear-gradient(135deg, #1abc9c, #16a085)', icon: <Mic size={70} color="white" /> },
    'paused': { bg: 'linear-gradient(135deg, #e67e22, #d35400)', icon: <Mic size={70} color="white" /> },
    'done': { bg: 'linear-gradient(135deg, #ffd700, #ffb800)', icon: <CheckCircle size={70} color="white" /> },
  };

  const currentStyle = statusColors[status] || statusColors['waiting'];

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      minHeight: '100vh', fontFamily: "'Inter', sans-serif", padding: '40px', textAlign: 'center'
    }}>

      <button onClick={() => { speechSynthRef.current.cancel(); navigate('/'); }}
        className="cognify-btn-secondary" style={{ position: 'absolute', top: '20px', left: '20px' }}>
        <ArrowLeft size={18} /> Back
      </button>

      <div className="cognify-coins" style={{ position: 'absolute', top: '20px', right: '20px' }}>
        🪙 {focusCoins}
      </div>

      <input type="file" accept=".pdf" ref={fileInputRef} onChange={handleFileUpload} style={{ display: 'none' }} />

      <h1 style={{ color: '#4b0082', fontSize: '32px', marginBottom: '6px' }}>Voice Navigator</h1>
      <p style={{ color: '#888', fontSize: '16px', marginBottom: '40px' }}>100% Hands-Free • Fully Accessible</p>

      {/* Animated Orb */}
      <div className={isSpeaking ? 'pulse-glow' : ''} style={{
        width: '160px', height: '160px', borderRadius: '50%',
        background: currentStyle.bg,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        margin: '0 auto 30px', transition: 'all 0.5s ease',
        boxShadow: isSpeaking ? '0 0 60px rgba(46, 204, 113, 0.4)' : isPaused ? '0 0 40px rgba(230, 126, 34, 0.3)' : '0 0 30px rgba(75, 0, 130, 0.2)'
      }}>
        {currentStyle.icon}
      </div>

      {/* Status Card */}
      <div className="cognify-card" style={{ maxWidth: '520px', width: '100%', padding: '28px' }}>
        <div className={`cognify-status ${status === 'reading' || status === 'waiting-command' ? 'focused' : status === 'checkin' ? 'remediation' : status === 'paused' ? 'remediation' : ''}`}
          style={{ marginBottom: '16px', display: 'inline-block', textTransform: 'uppercase', letterSpacing: '1px', fontSize: '12px' }}>
          {status.replace('-', ' ')}
        </div>

        <p style={{ fontSize: '18px', fontWeight: 600, color: '#1a1a2e', marginBottom: '8px' }}>{statusMessage}</p>

        {lastHeard && (
          <div style={{ fontSize: '13px', color: '#888', padding: '8px 16px', backgroundColor: '#f8f9fa', borderRadius: '8px', marginTop: '12px' }}>
            🎙️ Heard: "{lastHeard}"
          </div>
        )}

        {paragraphs.length > 0 && (
          <>
            <div className="cognify-focus-bar" style={{ margin: '20px 0 8px' }}>
              <div className="cognify-focus-fill" style={{ width: `${progressPercent}%`, backgroundColor: '#4b0082' }} />
            </div>
            <p style={{ fontSize: '12px', color: '#999' }}>
              Section {currentIndex + 1} of {paragraphs.length} • {progressPercent}% • {checkInCount} check-ins
            </p>
          </>
        )}

        {status === 'waiting' && (
          <div style={{ marginTop: '20px' }}>
            <p style={{ fontSize: '14px', color: '#aaa' }}>
              Press <span style={{ backgroundColor: '#4b0082', color: 'white', padding: '4px 14px', borderRadius: '6px', fontWeight: 600 }}>Spacebar</span> or say <b>"Upload"</b>
            </p>
          </div>
        )}

        {isPaused && (
          <div style={{ marginTop: '16px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px' }}>
            <p style={{ fontSize: '15px', color: '#e67e22', fontWeight: 600 }}>⏸️ Session Paused</p>
            <p style={{ fontSize: '13px', color: '#aaa' }}>
              Press <span style={{ backgroundColor: '#4b0082', color: 'white', padding: '4px 14px', borderRadius: '6px', fontWeight: 600 }}>Spacebar</span> or say <b>"Resume"</b>
            </p>
          </div>
        )}

        {isSpeaking && !isPaused && (
          <div style={{ marginTop: '16px', fontSize: '13px', color: '#2ecc71', fontWeight: 500 }}>
            🔊 Speaking...
          </div>
        )}
      </div>

      {/* Voice Commands */}
      <div className="cognify-card" style={{ marginTop: '30px', maxWidth: '400px', width: '100%', textAlign: 'left', fontSize: '13px', color: '#888', lineHeight: 2 }}>
        <h4 style={{ color: '#4b0082', marginBottom: '8px', fontSize: '14px' }}>🎙️ Voice Commands</h4>
        <div><b>"Upload"</b> — open file browser</div>
        <div><b>"Next"</b> — continue to next section</div>
        <div><b>"Repeat"</b> — hear section again</div>
        <div><b>"Explain"</b> — simpler explanation</div>
        <div><b>"Yes"</b> / <b>"No"</b> — answer check-ins</div>
        <div><b>"Pause"</b> / <b>"Resume"</b> — control playback</div>
        <div><b>"Go back"</b> — return to dashboard</div>
        <div style={{ marginTop: '8px', paddingTop: '8px', borderTop: '1px solid #eee' }}>
          <b>Spacebar</b> — upload / pause / resume<br/>
          <b>Escape</b> — go back to dashboard
        </div>
      </div>
    </div>
  );
};

export default VoiceNavigator;