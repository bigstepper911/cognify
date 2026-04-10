require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { GoogleGenerativeAI } = require('@google/generative-ai');

const app = express();

// Allow your React app (Port 3000) to talk to this server
app.use(cors());
// Allow the server to read JSON data sent from React
app.use(express.json());

// Initialize Gemini securely on the backend
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// Route 1: Generate the Quiz
app.post('/api/generate-quiz', async (req, res) => {
  try {
    const { text } = req.body;
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
    
    const prompt = `Based on the following text, generate one short, challenging active-recall question. 
    Make it a direct question, not multiple choice. Do not include the answer.
    Text: ${text}`;
    
    const result = await model.generateContent(prompt);
    const response = await result.response;
    
    res.json({ question: response.text().trim() });
  } catch (error) {
    console.error("AI Generation Error:", error);
    res.status(500).json({ error: 'Failed to generate quiz' });
  }
});

// Route 2: Grade the Answer
app.post('/api/grade-answer', async (req, res) => {
  try {
    const { question, answer } = req.body;
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
    
    const prompt = `The user was asked this question: "${question}". 
    They provided this answer: "${answer}". 
    Evaluate if their answer is semantically correct. 
    If correct, reply with exactly "CORRECT". 
    If incorrect, reply with exactly "INCORRECT" followed by a 1-sentence hint.`;
    
    const result = await model.generateContent(prompt);
    const response = await result.response;
    
    res.json({ feedback: response.text().trim() });
  } catch (error) {
    console.error("AI Grading Error:", error);
    res.status(500).json({ error: 'Failed to grade answer' });
  }
});
// Route 3: Summarize Notes
app.post('/api/summarize', async (req, res) => {
  try {
    const { text } = req.body;
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
    
    const prompt = `You are a study assistant. Summarize the following notes into clear, concise bullet points that a college student can quickly review. Keep it short but cover all key concepts. Use simple language.

Notes:
${text}`;
    
    const result = await model.generateContent(prompt);
    const response = await result.response;
    
    res.json({ summary: response.text().trim() });
  } catch (error) {
    console.error("AI Summary Error:", error);
    res.status(500).json({ error: 'Failed to summarize' });
  }
});

// Route 4: AI Reframe (Simple Analogy)
app.post('/api/reframe', async (req, res) => {
  try {
    const { text } = req.body;
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
    
    const prompt = `A student is struggling to understand this concept. Explain it in the simplest possible way using a real-world analogy or everyday example. Make it feel like a friendly tutor explaining to a beginner. Keep it under 4 sentences.

Concept:
${text}`;
    
    const result = await model.generateContent(prompt);
    const response = await result.response;
    
    res.json({ reframe: response.text().trim() });
  } catch (error) {
    console.error("AI Reframe Error:", error);
    res.status(500).json({ error: 'Failed to reframe' });
  }
});

// Route 5: YouTube Search
app.post('/api/youtube-search', async (req, res) => {
  try {
    const { topic } = req.body;
    const API_KEY = process.env.YOUTUBE_API_KEY;
    
    const searchUrl = `https://www.googleapis.com/youtube/v3/search?part=snippet&q=${encodeURIComponent(topic + " tutorial explanation")}&type=video&maxResults=3&key=${API_KEY}`;
    
    const response = await fetch(searchUrl);
    const data = await response.json();
    
    const videos = data.items.map(item => ({
      videoId: item.id.videoId,
      title: item.snippet.title,
      thumbnail: item.snippet.thumbnails.medium.url
    }));
    
    res.json({ videos });
  } catch (error) {
    console.error("YouTube Search Error:", error);
    res.status(500).json({ error: 'Failed to search YouTube' });
  }
});

const PORT = 5000;
app.listen(PORT, () => {
  console.log(`🔒 Secure Backend running on http://localhost:${PORT}`);
});