const { GoogleGenerativeAI } = require('@google/generative-ai');

// Initialize Gemini API if key is present
const apiKey = process.env.GEMINI_API_KEY;
const genAI = apiKey ? new GoogleGenerativeAI(apiKey) : null;

/**
 * Generates pre-visit summary from patient symptoms.
 * Includes graceful fallback if LLM is unavailable or fails.
 */
const generatePreVisitSummary = async (symptoms) => {
  const fallback = {
    urgencyLevel: 'Medium',
    chiefComplaint: symptoms,
    suggestedQuestions: [
      'What could be causing these symptoms?',
      'Are there any diagnostic tests recommended?',
      'What precautionary steps should I take?'
    ],
    isFallback: true
  };

  if (!genAI) {
    console.warn('GEMINI_API_KEY missing. Returning fallback pre-visit summary.');
    return fallback;
  }

  try {
    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
    const prompt = `Analyse these symptoms and return a JSON object with:
- urgencyLevel: exactly one of "Low", "Medium", or "High"
- chiefComplaint: a brief 1-sentence summary of the main issue
- suggestedQuestions: array of three questions for the doctor.

Return ONLY valid JSON.
Symptoms: ${symptoms}`;

    const result = await model.generateContent(prompt);
    const responseText = result.response.text();
    
    // Parse JSON safely
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
    return fallback;
  } catch (error) {
    console.error('AI Pre-Visit Summary Error:', error.message);
    return fallback; // Graceful degradation - system does not break
  }
};

/**
 * Generates patient-friendly post-visit summary from clinical notes.
 */
const generatePostVisitSummary = async (clinicalNotes) => {
  const fallback = {
    patientSummary: `Summary: ${clinicalNotes}`,
    medicationSchedule: 'Follow prescription instructions provided by doctor.',
    followUpSteps: 'Schedule a follow-up if symptoms persist.',
    isFallback: true
  };

  if (!genAI) {
    console.warn('GEMINI_API_KEY missing. Returning fallback post-visit summary.');
    return fallback;
  }

  try {
    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
    const prompt = `Convert these clinical notes into a JSON object with:
- patientSummary: a clear, patient-friendly explanation
- medicationSchedule: clear medication schedule
- followUpSteps: key follow-up steps

Return ONLY valid JSON.
Clinical Notes: ${clinicalNotes}`;

    const result = await model.generateContent(prompt);
    const responseText = result.response.text();

    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
    return fallback;
  } catch (error) {
    console.error('AI Post-Visit Summary Error:', error.message);
    return fallback;
  }
};

module.exports = {
  generatePreVisitSummary,
  generatePostVisitSummary,
};
