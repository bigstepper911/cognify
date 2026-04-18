<div align="center">

# 🧠 Cognify — The Attentive Tutor

### AI-Powered Accessible Study Companion

**🏆 1st Place Winner — FANTOM CODE 2026 (National Level Hackathon)**

*Built in 24 hours by Team DIETCOKE*

[![React](https://img.shields.io/badge/React-20232A?style=for-the-badge&logo=react&logoColor=61DAFB)](https://reactjs.org/)
[![Node.js](https://img.shields.io/badge/Node.js-339933?style=for-the-badge&logo=nodedotjs&logoColor=white)](https://nodejs.org/)
[![Firebase](https://img.shields.io/badge/Firebase-FFCA28?style=for-the-badge&logo=firebase&logoColor=black)](https://firebase.google.com/)
[![TensorFlow](https://img.shields.io/badge/TensorFlow.js-FF6F00?style=for-the-badge&logo=tensorflow&logoColor=white)](https://www.tensorflow.org/js)
[![Gemini](https://img.shields.io/badge/Gemini_AI-4285F4?style=for-the-badge&logo=google&logoColor=white)](https://ai.google.dev/)

---

</div>

## 💡 The Problem

- **65% of college students** lose focus within 10 minutes of digital learning
- **Visually impaired students** have almost zero accessible study tools
- **Neurodivergent students** (ADHD, Dyslexia) are underserved by traditional platforms

**Cognify solves all three.**

---

## 🚀 What is Cognify?

Cognify is a browser-based AI study companion that **watches, listens, and adapts** to each student. Upload any PDF — lecture notes, textbooks, anything — and Cognify creates an intelligent, personalized learning experience.

It doesn't just present content. It **actively monitors** if you're paying attention, **intervenes empathetically** when you lose focus, and **adapts its teaching style** based on whether you're distracted or genuinely confused.

---

## ✨ Key Features

### 📖 Read Mode — AI-Monitored Reading
- Paragraph-by-paragraph reading with clean, distraction-free UI
- **Real-time webcam face tracking** using TensorFlow BlazeFace
- Detects when you look away, look at your phone, or leave
- 5-second grace period before triggering intervention
- Live **Focus Score** and **Gaze Status** indicator (Focused / Looking Away / No Face)

### 🎧 Listen Mode — Spotify-Style Audio Learning
- Text-to-speech reads your notes aloud section by section
- **Lyrics-style live text highlighting** — words light up as they're spoken
- Toggle between **Full Notes** and **AI Summary** modes
- Playback controls: Play, Pause, Next, Previous, Repeat

### 🎙️ Voice Navigator — 100% Hands-Free
- Designed specifically for **visually impaired students**
- Upload PDF via spacebar or voice command
- Entire learning loop controlled by voice: Next, Repeat, Explain, Pause, Resume
- **Speak-then-listen pattern** — no mic conflicts
- Audio check-ins and AI explanations, zero screen interaction required

### 🧠 Empathetic AI Intervention
- When distraction is detected → **AI Pop Quiz** based on current content
- Answer correctly → earn **Focus Coins**, resume studying
- Answer wrong twice → Cognify asks: *"Were you distracted, or did you not understand?"*
  - **Distracted** → Repeats the section
  - **Didn't understand** → Triggers AI Reframe + YouTube tutorials

### 🔄 AI Reframe & YouTube Recommendations
- **Gemini AI** generates simple, real-world analogies for hard concepts
- **YouTube Data API** fetches the top 3 relevant tutorial videos automatically
- Just-in-time remediation — help exactly when the student needs it

### ✅ Proactive Check-Ins
- Every 2 sections, Cognify pauses and asks: *"Did you understand?"*
- Voice-responsive in Voice Navigator mode
- Earns Focus Coins for confirmed understanding

### ♿ Accessibility — Built Into the Foundation
| Feature | Description |
|---------|-------------|
| **High Contrast Mode** | Yellow on black for low-vision users |
| **Dyslexia-Friendly Font** | OpenDyslexic with increased spacing |
| **Blind User Mode** | Disables webcam, switches to audio-only check-ins |
| **Voice Control** | Full hands-free navigation in Voice Navigator |
| **Keyboard Shortcuts** | Spacebar (upload/pause/resume), Escape (go back) |

### 🪙 Focus Coins — Gamification
- Earn coins for: correct quiz answers (+10), check-in confirmations (+5)
- Live coin counter with cloud persistence via Firebase
- Focus Score tracks engagement over time

### 💾 Session Persistence
- Resume from exactly where you left off
- Progress saved per mode (Read Mode / Listen Mode)
- Resets automatically when a new PDF is uploaded

---

## 🏗️ Tech Stack

| Layer | Technology |
|-------|-----------|
| **Frontend** | React, CSS3, Lucide Icons |
| **Backend** | Node.js, Express.js |
| **AI Engine** | Google Gemini AI (quiz generation, grading, summarization, reframing) |
| **Computer Vision** | TensorFlow.js + BlazeFace (face detection & gaze tracking) |
| **Voice** | Web Speech API (Text-to-Speech + Speech Recognition) |
| **Video** | YouTube Data API v3 (auto-search tutorials) |
| **Auth** | Firebase Authentication (Google Sign-In) |
| **Database** | Cloud Firestore (user data, Focus Coins) |
| **PDF Parsing** | PDF.js |

---

## 📁 Project Structure

```
cognify/
├── backend/
│   ├── server.js          # Express API (Gemini, YouTube, Quiz, Grade, Reframe)
│   └── .env               # API keys (Gemini, YouTube)
├── src/
│   ├── pages/
│   │   ├── Login.jsx       # Google Auth + Voice Mode toggle
│   │   ├── Home.jsx        # Dashboard, PDF upload, AI Summary, Accessibility
│   │   ├── ReadMode.jsx    # Webcam tracking, quizzes, empathetic flow
│   │   ├── ListenMode.jsx  # Audio player, lyrics display, check-ins
│   │   └── VoiceNavigator.jsx  # Hands-free learning loop
│   ├── components/
│   │   └── AccessibilityPanel.jsx  # Toggle switches for a11y modes
│   ├── utils/
│   │   ├── gemini.js       # API helper functions
│   │   ├── db.js           # Firestore read/write
│   │   └── UserContext.js  # Global state (coins, accessibility)
│   ├── firebase.js         # Firebase config
│   ├── App.js              # Router
│   └── App.css             # Design system
└── package.json
```

---

## ⚡ Quick Start

### Prerequisites
- Node.js 16+
- Google Gemini API Key
- YouTube Data API v3 Key
- Firebase Project (Auth + Firestore)

### Setup

```bash
# Clone the repo
git clone https://github.com/bigstepper911/cognify.git
cd cognify

# Install frontend dependencies
npm install

# Install backend dependencies
cd backend
npm install

# Configure environment variables
# Create backend/.env
GEMINI_API_KEY=your_gemini_key
YOUTUBE_API_KEY=your_youtube_key

# Create .env in root (React)
REACT_APP_FIREBASE_API_KEY=your_key
REACT_APP_FIREBASE_AUTH_DOMAIN=your_domain
REACT_APP_FIREBASE_PROJECT_ID=your_project_id
REACT_APP_FIREBASE_STORAGE_BUCKET=your_bucket
REACT_APP_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
REACT_APP_FIREBASE_APP_ID=your_app_id

# Start backend
cd backend
node server.js

# Start frontend (in a new terminal)
cd ..
npm start
```

The app runs at `http://localhost:3000` with the backend at `http://localhost:5000`.

---

## 🎯 How It Works

```
Upload PDF → Choose Mode → Learn → AI Monitors → Intervention if needed → Resume
```

1. **Login** with Google
2. **Upload** any PDF — Cognify parses all pages and creates learning sections
3. **Choose a mode**: Read (visual), Listen (audio), or Voice Navigator (hands-free)
4. **Learn** — Cognify tracks your attention via webcam or tab-switching
5. **Distracted?** — AI quiz appears. Get it right → coins. Get it wrong → empathetic help
6. **Don't understand?** — AI explains it simpler + shows YouTube tutorials
7. **Check-ins** every 2 sections to make sure you're following along
8. **Resume anytime** — progress is saved automatically

---

## 🏆 Achievement

| | |
|---|---|
| **Event** | FANTOM CODE 2026 |
| **Type** | National-Level 24-Hour Hackathon |
| **Host** | RV Institute of Technology and Management, Bangalore |
| **Registrations** | 270+ teams from across India |
| **Selected** | 85 teams (on-site) |
| **Rounds** | 3 review rounds |
| **Result** | 🥇 1st Place — BE/B.Tech Category |
| **Prize** | ₹30,000 |

---

## 👥 Team DIETCOKE

- **Yashashwi Jain**
- **Nitin**
- **Manaswi Thorat**
- **Shrutika Rai**

*B.Tech CSE, 2nd Year — VIT Vellore*

---

## 📄 License

This project was built during FANTOM CODE 2026. All rights reserved by Team DIETCOKE.

---

<div align="center">

**Built with ❤️ and ☕ in 24 hours**

*Because every student deserves a tutor that never gives up on them.*

</div>