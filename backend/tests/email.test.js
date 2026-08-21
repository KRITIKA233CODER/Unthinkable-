const { sendBookingConfirmation, sendMedicationReminder } = require('../services/emailService');

describe('Email Service Unit Tests', () => {
  test('Constructs and attempts sending booking confirmation without throwing', async () => {
    const appointmentData = {
      date: '2026-09-10',
      timeSlot: '02:00 PM',
      symptoms: 'Mild cough',
      urgencyLevel: 'Low'
    };

    // Should run smoothly without crashing
    const result = await sendBookingConfirmation('patient@test.com', 'doctor@test.com', appointmentData);
    expect(result).toBeDefined();
  }, 15000);

  test('Constructs and attempts sending medication reminder without throwing', async () => {
    const result = await sendMedicationReminder('patient@test.com', 'John Doe', 'Take Vitamin D daily');
    expect(result).toBeDefined();
  }, 15000);
});
