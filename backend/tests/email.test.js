const {
  sendBookingConfirmation,
  sendCancellationEmail,
  sendDoctorLeaveCancellation,
  sendRescheduleEmail,
  sendMedicationReminder
} = require('../services/emailService');

describe('Email Service Notification Flows & Status Contract Tests', () => {

  const allowedStatuses = ['EMAIL_SENT', 'EMAIL_FAILED', 'EMAIL_NOT_CONFIGURED'];

  test('1. Booking confirmation flow returns valid status contract', async () => {
    const appointmentData = {
      date: '2026-09-10',
      timeSlot: '02:00 PM',
      symptoms: 'Mild cough',
      urgencyLevel: 'Low'
    };

    const result = await sendBookingConfirmation('patient@test.com', 'doctor@test.com', appointmentData);
    expect(result).toBeDefined();
    expect(allowedStatuses).toContain(result.status);
  }, 15000);

  test('2. Cancellation email flow returns valid status contract', async () => {
    const cancelData = {
      date: '2026-09-10',
      timeSlot: '02:00 PM'
    };

    const result = await sendCancellationEmail('patient@test.com', 'doctor@test.com', cancelData, 'Personal reasons');
    expect(result).toBeDefined();
    expect(allowedStatuses).toContain(result.status);
  }, 15000);

  test('3. Doctor leave cancellation flow returns valid status contract', async () => {
    const leaveData = {
      date: '2026-09-15',
      timeSlot: '10:00 AM'
    };

    const result = await sendDoctorLeaveCancellation('patient@test.com', 'doctor@test.com', leaveData, 'Medical conference');
    expect(result).toBeDefined();
    expect(allowedStatuses).toContain(result.status);
  }, 15000);

  test('4. Reschedule email flow returns valid status contract', async () => {
    const newDetails = {
      date: '2026-09-12',
      timeSlot: '11:00 AM'
    };
    const oldDetails = {
      date: '2026-09-10',
      timeSlot: '02:00 PM'
    };

    const result = await sendRescheduleEmail('patient@test.com', 'doctor@test.com', newDetails, oldDetails);
    expect(result).toBeDefined();
    expect(allowedStatuses).toContain(result.status);
  }, 15000);

  test('5. Medication reminder flow returns valid status contract', async () => {
    const result = await sendMedicationReminder('patient@test.com', 'John Doe', 'Amoxicillin 500mg BD x 5 days');
    expect(result).toBeDefined();
    expect(allowedStatuses).toContain(result.status);
  }, 15000);

  test('6. Empty recipients returns EMAIL_NOT_CONFIGURED status gracefully', async () => {
    const result = await sendBookingConfirmation('', '', {});
    expect(result.status).toBe('EMAIL_NOT_CONFIGURED');
  });
});
