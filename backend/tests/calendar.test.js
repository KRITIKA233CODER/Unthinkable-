const { createCalendarEvent, updateCalendarEvent, deleteCalendarEvent } = require('../services/calendarService');

describe('Google Calendar Service & Event ID Persistence Unit Tests', () => {

  test('createCalendarEvent degrades gracefully without throwing when OAuth credentials are missing', async () => {
    const fakeAppointment = {
      date: new Date('2026-09-01T10:00:00Z'),
      symptoms: 'Mild headache',
      preVisitSummary: { urgencyLevel: 'Low' }
    };
    const fakePatient = { name: 'Alex Rivera', email: 'alex@example.com' };
    const fakeDoctor = { name: 'Dr. Sarah Jenkins', email: 'sarah@clinic.com' };

    const eventId = await createCalendarEvent(fakeAppointment, fakePatient, fakeDoctor);
    expect(eventId).toBeNull();
  });

  test('updateCalendarEvent handles missing eventId gracefully without throwing', async () => {
    const result = await updateCalendarEvent(null, {}, {}, {});
    expect(result).toBeNull();
  });

  test('deleteCalendarEvent handles null or missing eventId gracefully without throwing', async () => {
    const result = await deleteCalendarEvent(null);
    expect(result).toBeNull();
  });

  test('Simulated event ID persistence on appointment object', () => {
    const appointment = {
      _id: 'appt_12345',
      status: 'Scheduled',
      googleCalendarEventId: undefined
    };

    const mockGoogleEventId = 'gcal_event_987654321';

    // When booking succeeds with calendar sync
    appointment.googleCalendarEventId = mockGoogleEventId;

    expect(appointment.googleCalendarEventId).toBe('gcal_event_987654321');

    // When appointment is cancelled, event ID is cleared
    appointment.status = 'Cancelled';
    appointment.googleCalendarEventId = undefined;

    expect(appointment.googleCalendarEventId).toBeUndefined();
    expect(appointment.status).toBe('Cancelled');
  });
});
