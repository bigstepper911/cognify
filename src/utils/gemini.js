// We are no longer importing the Gemini SDK here! 
// This file just sends HTTP requests to our secure Node.js backend.

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
    
    // SAFETY NET: If the backend sends an error or forgets the feedback, catch it!
    if (data.error || !data.feedback) {
      console.error("Backend returned an error:", data);
      return "INCORRECT: AI Grading Failed. Please check your backend terminal.";
    }

    return data.feedback;
  } catch (error) {
    console.error("Error connecting to backend:", error);
    return "INCORRECT: Backend communication failed.";
  }
};