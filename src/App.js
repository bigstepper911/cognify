import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import Login from './pages/Login';
import Home from './pages/Home';
import ReadMode from './pages/ReadMode';
import ListenMode from './pages/ListenMode'; // <-- ADD THIS IMPORT

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/" element={<Home />} />
        <Route path="/read" element={<ReadMode />} />
        <Route path="/listen" element={<ListenMode />} />
      </Routes>
    </Router>
  );
}

export default App;