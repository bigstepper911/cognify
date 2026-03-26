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

const PORT = 5000;
app.listen(PORT, () => {
  console.log(`🔒 Secure Backend running on http://localhost:${PORT}`);
});