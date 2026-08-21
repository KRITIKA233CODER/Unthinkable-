const { generatePreVisitSummary, generatePostVisitSummary } = require('../services/aiService');

describe('AI Service Graceful Fallback Unit Tests', () => {
  test('Gracefully generates fallback pre-visit summary when API key is missing/fails', async () => {
    const symptoms = 'Severe headache and fever for 2 days';
    const result = await generatePreVisitSummary(symptoms);

    expect(result).toHaveProperty('urgencyLevel');
    expect(result).toHaveProperty('chiefComplaint');
    expect(result).toHaveProperty('suggestedQuestions');
    expect(Array.isArray(result.suggestedQuestions)).toBe(true);
    expect(result.suggestedQuestions.length).toBe(3);
  });

  test('Gracefully generates fallback post-visit summary when API key is missing/fails', async () => {
    const clinicalNotes = 'Patient diagnosed with viral fever. Rest and hydration recommended. Paracetamol 500mg twice daily for 3 days.';
    const result = await generatePostVisitSummary(clinicalNotes);

    expect(result).toHaveProperty('patientSummary');
    expect(result).toHaveProperty('medicationSchedule');
    expect(result).toHaveProperty('followUpSteps');
  });
});
