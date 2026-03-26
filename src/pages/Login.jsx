import React from 'react';
import { useNavigate } from 'react-router-dom';
import { signInWithPopup } from 'firebase/auth';
import { auth, googleProvider } from '../firebase'; // Importing your secure vault
import { BrainCircuit } from 'lucide-react';

const Login = () => {
  const navigate = useNavigate();

  const handleGoogleLogin = async () => {
    try {
      // This pops up the Google Login window
      const result = await signInWithPopup(auth, googleProvider);
      const user = result.user;
      
      console.log("User logged in:", user.displayName);
      
      // If successful, send them to the Home screen!
      navigate('/');
    } catch (error) {
      console.error("Login failed:", error.message);
      alert("Failed to log in. Please try again.");
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100vh', backgroundColor: '#f4f4f9', fontFamily: 'sans-serif' }}>
      
      <div style={{ backgroundColor: 'white', padding: '50px', borderRadius: '15px', boxShadow: '0 4px 15px rgba(0,0,0,0.1)', textAlign: 'center', maxWidth: '400px' }}>
        <BrainCircuit size={60} color="#4b0082" style={{ marginBottom: '20px' }} />
        <h1 style={{ color: '#4b0082', marginBottom: '10px' }}>Welcome to Cognify</h1>
        <p style={{ color: '#666', marginBottom: '30px', fontSize: '16px' }}>The AI-powered, accessible learning platform.</p>

        <button 
          onClick={handleGoogleLogin}
          style={{ 
            display: 'flex', alignItems: 'center', justifyContent: 'center', width: '100%', 
            padding: '12px', fontSize: '16px', fontWeight: 'bold', color: '#333', 
            backgroundColor: '#fff', border: '2px solid #ccc', borderRadius: '8px', 
            cursor: 'pointer', transition: '0.2s'
          }}
          onMouseOver={(e) => e.target.style.backgroundColor = '#f1f1f1'}
          onMouseOut={(e) => e.target.style.backgroundColor = '#fff'}
        >
          <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" alt="Google Logo" style={{ width: '20px', marginRight: '10px' }} />
          Sign in with Google
        </button>
      </div>

    </div>
  );
};

export default Login;