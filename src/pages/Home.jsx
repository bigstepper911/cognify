import React, { useRef, useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { BookOpen, Headphones, Upload, CheckCircle } from 'lucide-react';
import * as pdfjsLib from 'pdfjs-dist';

// --- NEW IMPORTS FOR FIREBASE AUTH ---
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { auth } from '../firebase'; // Import your secure vault
import { loadUserData } from '../utils/db';

// This connects the PDF worker so it doesn't crash React
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;

const Home = () => {
  const navigate = useNavigate();
  const fileInputRef = useRef(null);
  
  // -- State variables --
  const [isUploaded, setIsUploaded] = useState(false);
  const [uploadText, setUploadText] = useState("Upload B.Tech PDF");
  const [user, setUser] = useState(null); // Tracks logged-in user
  const [focusCoins, setFocusCoins] = useState(0); // Placeholder for now!

// --- 🔒 THE BOUNCER & DATABASE FETCHER ---
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      if (currentUser) {
        setUser(currentUser); // Welcome in!
        
        // Go to the cloud and get their actual coins!
        const data = await loadUserData(currentUser.uid);
        setFocusCoins(data.focusCoins);
        
      } else {
        navigate('/login'); // Kick them back to login
      }
    });

    return () => unsubscribe();
  }, [navigate]);

  // --- LOGOUT FUNCTION ---
  const handleLogout = async () => {
    await signOut(auth);
    navigate('/login');
  };

  // --- PDF UPLOAD FUNCTION ---
  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setUploadText("Parsing PDF...");

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const typedarray = new Uint8Array(event.target.result);
        const pdf = await pdfjsLib.getDocument(typedarray).promise;
        
        // Extract text from Page 1 (Keeping it fast for the demo)
        const page = await pdf.getPage(1);
        const textContent = await page.getTextContent();
        const pageText = textContent.items.map(item => item.str).join(" ");
        
        // Save the real text to the browser's local database!
        localStorage.setItem("cognify_learning_text", pageText);
        
        setIsUploaded(true);
        setUploadText("PDF Loaded Successfully!");
      } catch (error) {
        console.error("Error reading PDF:", error);
        setUploadText("Error. Try again.");
      }
    };
    reader.readAsArrayBuffer(file);
  };

  // Don't render the page until the bouncer confirms the user exists
  if (!user) return <div style={{ textAlign: 'center', marginTop: '50px' }}>Loading...</div>;

  return (
    <div style={{ textAlign: 'center', padding: '50px', fontFamily: 'sans-serif', backgroundColor: '#f4f4f9', minHeight: '100vh' }}>
      
      {/* --- DASHBOARD HEADER --- */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '40px', backgroundColor: 'white', padding: '15px 30px', borderRadius: '12px', boxShadow: '0 4px 10px rgba(0,0,0,0.05)' }}>
        <div style={{ textAlign: 'left' }}>
          <h2 style={{ color: '#4b0082', margin: 0 }}>Cognify Dashboard</h2>
          <p style={{ color: '#666', marginTop: '5px', marginBottom: 0 }}>Welcome back, <b>{user.displayName}</b> 👋</p>
        </div>
        
        <div style={{ display: 'flex', gap: '15px', alignItems: 'center' }}>
          <div style={{ padding: '10px 15px', backgroundColor: '#ffd700', color: '#333', borderRadius: '8px', fontWeight: 'bold' }}>
            🪙 {focusCoins} Focus Coins
          </div>
          
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <img src={user.photoURL} alt="Profile" style={{ width: '40px', borderRadius: '50%' }} />
            <button onClick={handleLogout} style={{ padding: '8px 15px', backgroundColor: '#e74c3c', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold' }}>
              Logout
            </button>
          </div>
        </div>
      </div>

      {/* --- MAIN CONTENT --- */}
      <h1 style={{ color: '#4b0082' }}>🧠 Active Learning Hub</h1>
      <p style={{ fontSize: '18px', color: '#333' }}>Upload your notes and choose your focus mode.</p>

      {/* THE REAL PDF UPLOAD BUTTON */}
      <div style={{ margin: '40px 0' }}>
        <input 
          type="file" 
          accept="application/pdf" 
          ref={fileInputRef} 
          style={{ display: 'none' }} 
          onChange={handleFileUpload} 
        />
        <button 
          onClick={() => fileInputRef.current.click()} 
          style={{ ...btnStyle, backgroundColor: isUploaded ? '#2ecc71' : '#4b0082' }}
        >
          {isUploaded ? <CheckCircle size={20} style={{ marginRight: '10px' }} /> : <Upload size={20} style={{ marginRight: '10px' }} />}
          {uploadText}
        </button>
      </div>

      <h2 style={{ color: '#4b0082' }}>Choose Your Focus Mode:</h2>
      
      <div style={{ display: 'flex', justifyContent: 'center', gap: '30px', marginTop: '30px' }}>
        <button onClick={() => navigate('/read')} style={modeBtnStyle}>
          <BookOpen size={40} color="#4b0082" />
          <h3 style={{ margin: '10px 0' }}>Read Mode</h3>
          <p style={{ fontSize: '14px', color: '#555' }}>Interactive Text (Library Friendly)</p>
        </button>

        <button onClick={() => navigate('/listen')} style={modeBtnStyle}>
          <Headphones size={40} color="#4b0082" />
          <h3 style={{ margin: '10px 0' }}>Listen Mode</h3>
          <p style={{ fontSize: '14px', color: '#555' }}>Hands-Free Audio (100% Accessible)</p>
        </button>
      </div>
    </div>
  );
};

const btnStyle = { padding: '12px 24px', fontSize: '16px', cursor: 'pointer', display: 'flex', alignItems: 'center', margin: '0 auto', color: 'white', border: 'none', borderRadius: '8px', fontWeight: 'bold', transition: '0.3s' };
const modeBtnStyle = { padding: '25px', width: '250px', cursor: 'pointer', borderRadius: '12px', border: '2px solid #4b0082', backgroundColor: 'white', transition: '0.3s' };

export default Home;