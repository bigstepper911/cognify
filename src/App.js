import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { UserProvider } from './utils/UserContext';
import Login from './pages/Login';
import Home from './pages/Home';
import ReadMode from './pages/ReadMode';
import ListenMode from './pages/ListenMode';
import VoiceNavigator from './pages/VoiceNavigator';
import './App.css';

function App() {
  return (
    <UserProvider>
      <Router>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/" element={<Home />} />
          <Route path="/read" element={<ReadMode />} />
          <Route path="/listen" element={<ListenMode />} />
          <Route path="/voice" element={<VoiceNavigator />} />
        </Routes>
      </Router>
    </UserProvider>
  );
}

export default App;