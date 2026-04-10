import React, { createContext, useState, useContext, useEffect } from 'react';

const UserContext = createContext();

export const UserProvider = ({ children }) => {
  const [focusCoins, setFocusCoins] = useState(0);
  const [isVoiceMode, setIsVoiceMode] = useState(false);
  
  // NEW: Accessibility States
  const [isHighContrast, setIsHighContrast] = useState(() => localStorage.getItem('cognify_highContrast') === 'true');
  const [isDyslexiaFont, setIsDyslexiaFont] = useState(() => localStorage.getItem('cognify_dyslexiaFont') === 'true');
  const [isBlindMode, setIsBlindMode] = useState(() => localStorage.getItem('cognify_blindMode') === 'true');

  // Persist accessibility preferences
  useEffect(() => {
    localStorage.setItem('cognify_highContrast', isHighContrast);
    localStorage.setItem('cognify_dyslexiaFont', isDyslexiaFont);
    localStorage.setItem('cognify_blindMode', isBlindMode);
  }, [isHighContrast, isDyslexiaFont, isBlindMode]);

  // Apply CSS classes to body
  useEffect(() => {
    document.body.classList.toggle('high-contrast', isHighContrast);
    document.body.classList.toggle('dyslexia-font', isDyslexiaFont);
    document.body.classList.toggle('blind-mode', isBlindMode);
  }, [isHighContrast, isDyslexiaFont, isBlindMode]);

  return (
    <UserContext.Provider value={{ 
      focusCoins, setFocusCoins, 
      isVoiceMode, setIsVoiceMode,
      isHighContrast, setIsHighContrast,
      isDyslexiaFont, setIsDyslexiaFont,
      isBlindMode, setIsBlindMode
    }}>
      {children}
    </UserContext.Provider>
  );
};

export const useUser = () => useContext(UserContext);