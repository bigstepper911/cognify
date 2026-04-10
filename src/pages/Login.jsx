import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { signInWithPopup } from 'firebase/auth';
import { auth, googleProvider } from '../firebase';
import { BrainCircuit, Sparkles, Shield, Headphones } from 'lucide-react';
import { useUser } from '../utils/UserContext';

const Login = () => {
  const navigate = useNavigate();
  const { isVoiceMode, setIsVoiceMode } = useUser();
  const [isHovered, setIsHovered] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const handleToggleVoice = () => {
    const newMode = !isVoiceMode;
    setIsVoiceMode(newMode);
    window.speechSynthesis.cancel();
    if (newMode) {
      window.speechSynthesis.speak(new SpeechSynthesisUtterance("Voice Navigator enabled. Please log in."));
    }
  };

  const handleGoogleLogin = async () => {
    try {
      setIsLoading(true);
      await signInWithPopup(auth, googleProvider);
      navigate('/');
    } catch (error) {
      console.error("Login failed:", error.message);
      alert("Failed to log in. Please try again.");
      setIsLoading(false);
    }
  };

  return (
    <div style={{ 
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', 
      minHeight: '100vh', 
      background: 'linear-gradient(135deg, #f5f3ff 0%, #ede9fe 50%, #e8e4ef 100%)',
      fontFamily: "'Inter', system-ui, sans-serif",
      padding: '20px'
    }}>
      
      {/* Floating Feature Tags */}
      <div style={{ display: 'flex', gap: '12px', marginBottom: '30px', flexWrap: 'wrap', justifyContent: 'center' }}>
        {[
          { icon: <Sparkles size={14} />, text: 'AI-Powered' },
          { icon: <Shield size={14} />, text: 'Accessible' },
          { icon: <Headphones size={14} />, text: 'Hands-Free' }
        ].map((tag, i) => (
          <div key={i} style={{ 
            display: 'flex', alignItems: 'center', gap: '6px',
            padding: '6px 14px', backgroundColor: 'rgba(75, 0, 130, 0.08)', 
            borderRadius: '20px', fontSize: '13px', color: '#4b0082', fontWeight: 500 
          }}>
            {tag.icon} {tag.text}
          </div>
        ))}
      </div>

      {/* Main Card */}
      <div style={{ 
        backgroundColor: '#ffffff', padding: '50px 40px', borderRadius: '24px', 
        boxShadow: '0 20px 60px rgba(75, 0, 130, 0.1), 0 1px 3px rgba(0,0,0,0.05)', 
        textAlign: 'center', maxWidth: '420px', width: '100%'
      }}>
        
        {/* Brain Icon */}
        <div style={{ 
          display: 'flex', justifyContent: 'center', alignItems: 'center', 
          width: '80px', height: '80px', 
          background: 'linear-gradient(135deg, #f3ebf8, #e8d5f5)', 
          borderRadius: '50%', margin: '0 auto 24px auto' 
        }}>
          <BrainCircuit size={40} color="#4b0082" />
        </div>

        <h1 style={{ color: '#1a1a2e', marginBottom: '8px', fontSize: '32px', fontWeight: '800', letterSpacing: '-0.5px' }}>
          Cognify
        </h1>
        <p style={{ color: '#666', marginBottom: '12px', fontSize: '15px', lineHeight: '1.5' }}>
          The AI-powered, accessible learning platform.
        </p>
        <p style={{ color: '#999', marginBottom: '36px', fontSize: '13px' }}>
          Attention tracking • Smart quizzes • Voice control
        </p>

        {/* Voice Mode Toggle */}
        <div style={{ 
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', 
          backgroundColor: isVoiceMode ? '#f8f4fa' : '#f8f9fa', 
          border: isVoiceMode ? '2px solid #d8b4e2' : '1px solid #eaeaea', 
          padding: '16px 20px', borderRadius: '16px', marginBottom: '24px', textAlign: 'left',
          transition: 'all 0.3s ease'
        }}>
          <div>
            <h3 style={{ margin: 0, fontSize: '15px', color: '#1a1a2e', fontWeight: '600' }}>Voice Navigator</h3>
            <p style={{ margin: 0, fontSize: '13px', color: '#888', marginTop: '4px' }}>100% hands-free for visually impaired</p>
          </div>
          <div 
            onClick={handleToggleVoice}
            className="cognify-switch"
            style={{ backgroundColor: isVoiceMode ? '#4b0082' : '#d1d5db' }}
          >
            <div className="cognify-switch-knob" style={{ left: isVoiceMode ? '24px' : '2px' }} />
          </div>
        </div>

        {/* Google Login Button */}
        <button 
          onClick={handleGoogleLogin}
          onMouseEnter={() => setIsHovered(true)}
          onMouseLeave={() => setIsHovered(false)}
          disabled={isLoading}
          style={{ 
            display: 'flex', alignItems: 'center', justifyContent: 'center', width: '100%', 
            padding: '14px', fontSize: '16px', fontWeight: '600', 
            color: isLoading ? '#999' : '#333', 
            backgroundColor: isHovered ? '#f9fafb' : '#fff', 
            border: '1px solid #d1d5db', borderRadius: '12px', 
            cursor: isLoading ? 'not-allowed' : 'pointer', 
            transition: 'all 0.2s ease',
            boxShadow: isHovered ? '0 4px 12px rgba(0,0,0,0.06)' : '0 1px 2px rgba(0,0,0,0.05)'
          }}
        >
          <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" alt="Google" style={{ width: '22px', marginRight: '12px' }} />
          {isLoading ? 'Signing in...' : 'Continue with Google'}
        </button>
      </div>

      {/* Footer */}
      <p style={{ marginTop: '24px', fontSize: '12px', color: '#aaa' }}>
        Built for FANTOM CODE 2026
      </p>
    </div>
  );
};

export default Login;