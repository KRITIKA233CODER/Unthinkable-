const { GoogleGenerativeAI } = require('@google/generative-ai');

/**
 * Dynamically retrieves a Gemini AI instance using environment credentials.
 * Ensures dynamically added keys in .env are picked up immediately.
 */
const getGenAI = () => {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey.trim() === '' || apiKey.includes('your_google_gemini_api_key')) {
    return null;
  }
  return new GoogleGenerativeAI(apiKey.trim());
};

/**
 * Generates pre-visit summary from patient symptoms.
 * Uses real Google Gemini LLM if configured; provides structured fallback on error/missing key.
 */
const generatePreVisitSummary = async (symptoms) => {
  const fallback = {
    urgencyLevel: 'Medium',
    chiefComplaint: symptoms || 'General symptom consultation',
    suggestedQuestions: [
      'What could be the primary cause of these symptoms?',
      'Are there any diagnostic tests or labs recommended?',
      'What precautions or lifestyle adjustments should I take?'
    ],
    isFallback: true
  };

  const genAI = getGenAI();
  if (!genAI) {
    console.warn('[AI_SERVICE] GEMINI_API_KEY missing or not configured. Returning deterministic fallback pre-visit summary.');
    return fallback;
  }

  try {
    console.log('[AI_SERVICE] Calling Google Gemini API (gemini-3.6-flash) for pre-visit symptom triage...');
    const model = genAI.getGenerativeModel({ model: 'gemini-3.6-flash' });
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
      const parsed = JSON.parse(jsonMatch[0]);
      console.log('[AI_SERVICE] Google Gemini pre-visit summary generated successfully.');
      return {
        urgencyLevel: ['Low', 'Medium', 'High'].includes(parsed.urgencyLevel) ? parsed.urgencyLevel : 'Medium',
        chiefComplaint: parsed.chiefComplaint || symptoms,
        suggestedQuestions: Array.isArray(parsed.suggestedQuestions) && parsed.suggestedQuestions.length > 0 
          ? parsed.suggestedQuestions 
          : fallback.suggestedQuestions,
        isFallback: false
      };
    }

    console.warn('[AI_SERVICE] Malformed JSON from Gemini. Returning structured fallback.');
    return fallback;
  } catch (error) {
    console.error('[AI_SERVICE_ERROR] Gemini Pre-Visit failed:', error.message);
    return fallback; // Graceful degradation - appointment booking never crashes
  }
};

/**
 * Generates patient-friendly post-visit summary from clinical notes.
 */
const generatePostVisitSummary = async (clinicalNotes) => {
  const fallback = {
    patientSummary: `Clinical Consultation Summary: ${clinicalNotes}`,
    medicationSchedule: 'Follow prescription instructions provided by doctor.',
    followUpSteps: 'Schedule a follow-up appointment if symptoms persist or worsen.',
    isFallback: true
  };

  const genAI = getGenAI();
  if (!genAI) {
    console.warn('[AI_SERVICE] GEMINI_API_KEY missing. Returning fallback post-visit summary.');
    return fallback;
  }

  try {
    console.log('[AI_SERVICE] Calling Google Gemini API (gemini-3.6-flash) for post-visit care plan translation...');
    const model = genAI.getGenerativeModel({ model: 'gemini-3.6-flash' });
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
      const parsed = JSON.parse(jsonMatch[0]);
      console.log('[AI_SERVICE] Google Gemini post-visit care plan generated successfully.');
      return {
        patientSummary: parsed.patientSummary || fallback.patientSummary,
        medicationSchedule: parsed.medicationSchedule || fallback.medicationSchedule,
        followUpSteps: parsed.followUpSteps || fallback.followUpSteps,
        isFallback: false
      };
    }

    console.warn('[AI_SERVICE] Malformed JSON from Gemini. Returning fallback post-visit summary.');
    return fallback;
  } catch (error) {
    console.error('[AI_SERVICE_ERROR] Gemini Post-Visit failed:', error.message);
    return fallback;
  }
};

module.exports = {
  generatePreVisitSummary,
  generatePostVisitSummary,
};
