require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { GoogleGenerativeAI } = require('@google/generative-ai');

const app = express();
app.use(cors());
app.use(express.json({ limit: '50mb' }));

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// Helper function to safely call Gemini
async function askGemini(prompt) {
  const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });
  const result = await model.generateContent(prompt);
  const response = await result.response;
  return response.text().trim();
}

// Route 1: Generate Quiz
app.post('/api/generate-quiz', async (req, res) => {
  try {
    const { text } = req.body;
    if (!text || text.length < 10) {
      return res.json({ question: "What is the main topic discussed in this section?" });
    }
    
    const shortText = text.substring(0, 2000);
    const prompt = `Based on the following text, generate one short, challenging active-recall question. Make it a direct question, not multiple choice. Do not include the answer. Keep it under 20 words.
    
Text: ${shortText}`;
    
    const question = await askGemini(prompt);
    console.log("✅ Quiz generated:", question.substring(0, 50));
    res.json({ question });
  } catch (error) {
    console.error("❌ Quiz Error:", error.message);
    res.json({ question: "What are the key concepts discussed in this section?" });
  }
});

// Route 2: Grade Answer
app.post('/api/grade-answer', async (req, res) => {
  try {
    const { question, answer } = req.body;
    if (!question || !answer) {
      return res.json({ feedback: "INCORRECT: Please provide an answer." });
    }

    const prompt = `The user was asked: "${question}". 
They answered: "${answer}". 
Evaluate if their answer is semantically correct. 
If correct, reply with exactly "CORRECT". 
If incorrect, reply with exactly "INCORRECT" followed by a 1-sentence hint.`;
    
    const feedback = await askGemini(prompt);
    console.log("✅ Graded:", feedback.substring(0, 50));
    res.json({ feedback });
  } catch (error) {
    console.error("❌ Grade Error:", error.message);
    res.json({ feedback: "INCORRECT: Could not grade. Try again." });
  }
});

// Route 3: Summarize Notes
app.post('/api/summarize', async (req, res) => {
  try {
    const { text } = req.body;
    if (!text) return res.json({ summary: "No text provided." });

    const shortText = text.substring(0, 5000);
    const prompt = `Summarize the following notes into clear, concise bullet points for a college student. Keep it short but cover all key concepts. Use simple language.

Notes: ${shortText}`;
    
    const summary = await askGemini(prompt);
    console.log("✅ Summary generated");
    res.json({ summary });
  } catch (error) {
    console.error("❌ Summary Error:", error.message);
    res.json({ summary: "Could not generate summary. Please try again." });
  }
});

// Route 4: AI Reframe
app.post('/api/reframe', async (req, res) => {
  try {
    const { text } = req.body;
    if (!text) return res.json({ reframe: "No text provided." });

    const shortText = text.substring(0, 2000);
    const prompt = `A student is struggling to understand this concept. Explain it in the simplest possible way using a real-world analogy or everyday example. Make it feel like a friendly tutor explaining to a beginner. Keep it under 4 sentences.

Concept: ${shortText}`;
    
    const reframe = await askGemini(prompt);
    console.log("✅ Reframe generated");
    res.json({ reframe });
  } catch (error) {
    console.error("❌ Reframe Error:", error.message);
    res.json({ reframe: "Think of this concept like a recipe — each step builds on the last. Focus on understanding the ingredients (key terms) first, then the process (how they connect)." });
  }
});

// Route 5: YouTube Search
app.post('/api/youtube-search', async (req, res) => {
  try {
    const { topic } = req.body;
    if (!topic) return res.json({ videos: [] });

    const API_KEY = process.env.YOUTUBE_API_KEY;
    if (!API_KEY) {
      console.error("❌ No YOUTUBE_API_KEY in .env");
      return res.json({ videos: [] });
    }

    const searchQuery = encodeURIComponent(topic + " tutorial explanation");
    const searchUrl = `https://www.googleapis.com/youtube/v3/search?part=snippet&q=${searchQuery}&type=video&maxResults=3&key=${API_KEY}`;
    
    const response = await fetch(searchUrl);
    const data = await response.json();
    
    if (data.error) {
      console.error("❌ YouTube API Error:", data.error.message);
      return res.json({ videos: [] });
    }

    const videos = (data.items || []).map(item => ({
      videoId: item.id.videoId,
      title: item.snippet.title,
      thumbnail: item.snippet.thumbnails.medium.url
    }));
    
    console.log("✅ YouTube found", videos.length, "videos");
    res.json({ videos });
  } catch (error) {
    console.error("❌ YouTube Error:", error.message);
    res.json({ videos: [] });
  }
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', gemini: !!process.env.GEMINI_API_KEY, youtube: !!process.env.YOUTUBE_API_KEY });
});

const PORT = 5000;
app.listen(PORT, () => {
  console.log(`🔒 Secure Backend running on http://localhost:${PORT}`);
  console.log(`🔑 Gemini API Key: ${process.env.GEMINI_API_KEY ? 'LOADED' : '❌ MISSING'}`);
  console.log(`🔑 YouTube API Key: ${process.env.YOUTUBE_API_KEY ? 'LOADED' : '❌ MISSING'}`);
});