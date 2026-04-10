import React from 'react';
import { Settings, Eye, Type, EarOff } from 'lucide-react';
import { useUser } from '../utils/UserContext';

const AccessibilityPanel = () => {
  const { 
    isHighContrast, setIsHighContrast, 
    isDyslexiaFont, setIsDyslexiaFont, 
    isBlindMode, setIsBlindMode 
  } = useUser();

  const Toggle = ({ isOn, onToggle, label, description, icon: Icon }) => (
    <div className="cognify-toggle-row">
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        <Icon size={20} color={isOn ? '#4b0082' : '#999'} />
        <div>
          <div style={{ fontWeight: 600, fontSize: '14px', color: '#1a1a2e' }}>{label}</div>
          <div style={{ fontSize: '12px', color: '#888', marginTop: '2px' }}>{description}</div>
        </div>
      </div>
      <div 
        className="cognify-switch"
        onClick={onToggle}
        style={{ backgroundColor: isOn ? '#4b0082' : '#d1d5db' }}
      >
        <div className="cognify-switch-knob" style={{ left: isOn ? '24px' : '2px' }} />
      </div>
    </div>
  );

  return (
    <div className="cognify-settings-panel">
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px' }}>
        <Settings size={20} color="#4b0082" />
        <h3 style={{ margin: 0, color: '#4b0082', fontSize: '16px' }}>Accessibility</h3>
      </div>

      <Toggle
        isOn={isHighContrast}
        onToggle={() => setIsHighContrast(!isHighContrast)}
        label="High Contrast"
        description="Yellow on black for low vision"
        icon={Eye}
      />
      <Toggle
        isOn={isDyslexiaFont}
        onToggle={() => setIsDyslexiaFont(!isDyslexiaFont)}
        label="Dyslexia-Friendly Font"
        description="OpenDyslexic with extra spacing"
        icon={Type}
      />
      <Toggle
        isOn={isBlindMode}
        onToggle={() => {
          setIsBlindMode(!isBlindMode);
          const msg = !isBlindMode 
            ? "Blind mode enabled. Webcam disabled. All interactions are now voice-based." 
            : "Blind mode disabled. Webcam tracking re-enabled.";
          window.speechSynthesis.cancel();
          window.speechSynthesis.speak(new SpeechSynthesisUtterance(msg));
        }}
        label="Blind User Mode"
        description="Disables webcam, 100% audio"
        icon={EarOff}
      />
    </div>
  );
};

export default AccessibilityPanel;