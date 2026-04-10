import React, { useRef, useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { BookOpen, Headphones, Upload, CheckCircle, FileText, Sparkles, Mic } from 'lucide-react';
import * as pdfjsLib from 'pdfjs-dist';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { auth } from '../firebase';
import { loadUserData } from '../utils/db';
import { useUser } from '../utils/UserContext';
import { summarizeNotes } from '../utils/gemini';
import AccessibilityPanel from '../components/AccessibilityPanel';

pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;

const Home = () => {
  const navigate = useNavigate();
  const fileInputRef = useRef(null);
  
  const [isUploaded, setIsUploaded] = useState(false);
  const [uploadText, setUploadText] = useState("Upload Your Study PDF");
  const [user, setUser] = useState(null);
  const [focusCoins, setFocusCoins] = useState(0);
  const [isSummarizing, setIsSummarizing] = useState(false);
  const [summaryReady, setSummaryReady] = useState(false);
  const [pageCount, setPageCount] = useState(0);
  const [sectionCount, setSectionCount] = useState(0);
  
  const { isVoiceMode } = useUser();

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      if (currentUser) {
        setUser(currentUser);
        const data = await loadUserData(currentUser.uid);
        setFocusCoins(data.focusCoins);
        
        // Check if text already uploaded
        if (localStorage.getItem("cognify_learning_text")) {
          setIsUploaded(true);
          setUploadText("PDF Already Loaded");
          const paragraphs = JSON.parse(localStorage.getItem("cognify_paragraphs") || "[]");
          setSectionCount(paragraphs.length);
        }
        if (localStorage.getItem("cognify_summary")) {
          setSummaryReady(true);
        }
      } else {
        navigate('/login');
      }
    });
    return () => unsubscribe();
  }, [navigate]);

  useEffect(() => {
    if (user && isVoiceMode) navigate('/voice');
  }, [user, isVoiceMode, navigate]);

  const handleLogout = async () => {
    await signOut(auth);
    navigate('/login');
  };

  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setUploadText("Parsing PDF...");
    setSummaryReady(false);

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const typedarray = new Uint8Array(event.target.result);
        const pdf = await pdfjsLib.getDocument(typedarray).promise;
        let fullText = "";

        for (let i = 1; i <= pdf.numPages; i++) {
          const page = await pdf.getPage(i);
          const textContent = await page.getTextContent();
          const pageText = textContent.items.map(item => item.str).join(" ");
          fullText += pageText + "\n\n";
        }

        const paragraphs = fullText.split(/\n\n+/).map(p => p.trim()).filter(p => p.length > 30);

        localStorage.setItem("cognify_learning_text", fullText.trim());
        localStorage.setItem("cognify_paragraphs", JSON.stringify(paragraphs));
        localStorage.removeItem("cognify_read_progress");
        localStorage.removeItem("cognify_listen_progress");
        localStorage.removeItem("cognify_summary");
        
        setIsUploaded(true);
        setPageCount(pdf.numPages);
        setSectionCount(paragraphs.length);
        setUploadText(`PDF Loaded! (${pdf.numPages} pages, ${paragraphs.length} sections)`);
      } catch (error) {
        console.error("Error reading PDF:", error);
        setUploadText("Error. Try another PDF.");
      }
    };
    reader.readAsArrayBuffer(file);
  };

  const handleSummarize = async () => {
    const text = localStorage.getItem("cognify_learning_text");
    if (!text) return;
    
    setIsSummarizing(true);
    const summary = await summarizeNotes(text);
    localStorage.setItem("cognify_summary", summary);
    setIsSummarizing(false);
    setSummaryReady(true);
  };

  if (!user) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh' }}>
      <div className="pulse-glow" style={{ fontSize: '18px', color: '#4b0082' }}>Loading Cognify...</div>
    </div>
  );

  return (
    <div style={{ padding: '30px', fontFamily: "'Inter', sans-serif", minHeight: '100vh' }}>
      
      {/* Header */}
      <div className="cognify-header">
        <div>
          <h2 style={{ color: '#4b0082', margin: 0, fontSize: '22px' }}>Cognify Dashboard</h2>
          <p style={{ color: '#666', marginTop: '4px', marginBottom: 0, fontSize: '14px' }}>Welcome back, <b>{user.displayName}</b></p>
        </div>
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
          <div className="cognify-coins">🪙 {focusCoins}</div>
          <img src={user.photoURL} alt="Profile" style={{ width: '38px', borderRadius: '50%', border: '2px solid #e8e4ef' }} />
          <button onClick={handleLogout} className="cognify-btn-danger">Logout</button>
        </div>
      </div>

      <div style={{ display: 'flex', gap: '30px', marginTop: '10px' }}>
        
        {/* Main Content */}
        <div style={{ flex: 3 }}>
          
          {/* Upload Section */}
          <div className="cognify-card" style={{ textAlign: 'center', padding: '40px', marginBottom: '30px' }}>
            <h1 style={{ color: '#4b0082', fontSize: '28px', marginBottom: '8px' }}>Active Learning Hub</h1>
            <p style={{ fontSize: '16px', color: '#666', marginBottom: '30px' }}>Upload your notes and choose your focus mode.</p>

            <input type="file" accept="application/pdf" ref={fileInputRef} style={{ display: 'none' }} onChange={handleFileUpload} />
            
            <div style={{ display: 'flex', gap: '12px', justifyContent: 'center', flexWrap: 'wrap' }}>
              <button onClick={() => fileInputRef.current.click()} className={isUploaded ? "cognify-btn-success" : "cognify-btn-primary"} style={{ padding: '14px 28px', fontSize: '16px' }}>
                {isUploaded ? <CheckCircle size={20} /> : <Upload size={20} />}
                {uploadText}
              </button>

              {isUploaded && !summaryReady && (
                <button onClick={handleSummarize} className="cognify-btn-secondary" disabled={isSummarizing} style={{ padding: '14px 28px', fontSize: '16px' }}>
                  <Sparkles size={20} />
                  {isSummarizing ? 'AI Summarizing...' : 'Generate AI Summary'}
                </button>
              )}

              {summaryReady && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '14px 20px', backgroundColor: '#d4edda', borderRadius: '12px', color: '#155724', fontWeight: 600 }}>
                  <CheckCircle size={20} /> Summary Ready!
                </div>
              )}
            </div>

            {isUploaded && (
              <p style={{ marginTop: '16px', fontSize: '13px', color: '#999' }}>
                {pageCount} pages parsed • {sectionCount} learning sections detected
              </p>
            )}
          </div>

          {/* Mode Selection */}
          <h2 style={{ color: '#4b0082', fontSize: '20px', marginBottom: '20px' }}>Choose Your Focus Mode</h2>
          
          <div style={{ display: 'flex', gap: '20px', flexWrap: 'wrap' }}>
            
            <div className="cognify-mode-card" onClick={() => navigate('/read')}>
              <BookOpen size={40} color="#4b0082" />
              <h3 style={{ margin: '12px 0 6px', color: '#1a1a2e' }}>Read Mode</h3>
              <p style={{ fontSize: '13px', color: '#888' }}>Interactive text with webcam tracking</p>
              <div style={{ display: 'flex', gap: '6px', marginTop: '12px', justifyContent: 'center', flexWrap: 'wrap' }}>
                <span style={tagStyle}>AI Quizzes</span>
                <span style={tagStyle}>Face Detection</span>
              </div>
            </div>

            <div className="cognify-mode-card" onClick={() => navigate('/listen')}>
              <Headphones size={40} color="#4b0082" />
              <h3 style={{ margin: '12px 0 6px', color: '#1a1a2e' }}>Listen Mode</h3>
              <p style={{ fontSize: '13px', color: '#888' }}>Hands-free audio learning</p>
              <div style={{ display: 'flex', gap: '6px', marginTop: '12px', justifyContent: 'center', flexWrap: 'wrap' }}>
                <span style={tagStyle}>Voice Commands</span>
                <span style={tagStyle}>Check-Ins</span>
              </div>
            </div>

            <div className="cognify-mode-card" onClick={() => navigate('/voice')}>
              <Mic size={40} color="#4b0082" />
              <h3 style={{ margin: '12px 0 6px', color: '#1a1a2e' }}>Voice Navigator</h3>
              <p style={{ fontSize: '13px', color: '#888' }}>100% accessible, zero screen required</p>
              <div style={{ display: 'flex', gap: '6px', marginTop: '12px', justifyContent: 'center', flexWrap: 'wrap' }}>
                <span style={tagStyle}>Blind-Friendly</span>
                <span style={tagStyle}>Full Audio</span>
              </div>
            </div>
          </div>
        </div>

        {/* Right Sidebar */}
        <div style={{ flex: 1, minWidth: '280px' }}>
          <AccessibilityPanel />
          
          {/* Quick Stats */}
          <div className="cognify-card" style={{ marginTop: '20px', textAlign: 'center' }}>
            <h4 style={{ color: '#4b0082', marginBottom: '16px' }}>Your Stats</h4>
            <div style={{ display: 'flex', justifyContent: 'space-around' }}>
              <div>
                <div style={{ fontSize: '28px', fontWeight: 800, color: '#4b0082' }}>{focusCoins}</div>
                <div style={{ fontSize: '12px', color: '#888' }}>Focus Coins</div>
              </div>
              <div>
                <div style={{ fontSize: '28px', fontWeight: 800, color: '#2ecc71' }}>{sectionCount}</div>
                <div style={{ fontSize: '12px', color: '#888' }}>Sections</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

const tagStyle = { padding: '4px 10px', backgroundColor: '#f3ebf8', color: '#4b0082', borderRadius: '6px', fontSize: '11px', fontWeight: 600 };

export default Home;