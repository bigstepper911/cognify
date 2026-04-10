const BACKEND_URL = 'http://localhost:5000/api';

export const generatePopQuiz = async (text) => {
  try {
    const response = await fetch(`${BACKEND_URL}/generate-quiz`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text })
    });
    const data = await response.json();
    return data.question;
  } catch (error) {
    console.error("Error connecting to backend:", error);
    return "Error: Could not connect to secure server.";
  }
};

export const gradeAnswer = async (question, answer) => {
  try {
    const response = await fetch(`${BACKEND_URL}/grade-answer`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question, answer })
    });
    const data = await response.json();
    if (data.error || !data.feedback) {
      return "INCORRECT: AI Grading Failed. Please check your backend terminal.";
    }
    return data.feedback;
  } catch (error) {
    console.error("Error connecting to backend:", error);
    return "INCORRECT: Backend communication failed.";
  }
};

// NEW: Summarize notes
export const summarizeNotes = async (text) => {
  try {
    const response = await fetch(`${BACKEND_URL}/summarize`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text })
    });
    const data = await response.json();
    return data.summary || "Could not generate summary.";
  } catch (error) {
    console.error("Error summarizing:", error);
    return "Error: Could not connect to server.";
  }
};

// NEW: AI Reframe (simple analogy)
export const reframeContent = async (text) => {
  try {
    const response = await fetch(`${BACKEND_URL}/reframe`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text })
    });
    const data = await response.json();
    return data.reframe || "Could not generate reframe.";
  } catch (error) {
    console.error("Error reframing:", error);
    return "Error: Could not connect to server.";
  }
};

// NEW: YouTube video search
export const searchYouTube = async (topic) => {
  try {
    const response = await fetch(`${BACKEND_URL}/youtube-search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ topic })
    });
    const data = await response.json();
    return data.videos || [];
  } catch (error) {
    console.error("Error searching YouTube:", error);
    return [];
  }
};