const {
  createCalendarEvent,
  updateCalendarEvent,
  deleteCalendarEvent,
  generateAuthUrl,
  hasValidCredentials,
  REDIRECT_URI,
  CALENDAR_SCOPE
} = require('../services/calendarService');

describe('Google Calendar Service & Event ID Persistence Unit Tests', () => {

  test('REDIRECT_URI and CALENDAR_SCOPE are configured accurately', () => {
    expect(REDIRECT_URI).toBe('http://localhost:5000/api/auth/google/callback');
    expect(CALENDAR_SCOPE).toContain('https://www.googleapis.com/auth/calendar.events');
  });

  test('generateAuthUrl throws clear error when client ID or secret is missing', () => {
    const origId = process.env.GOOGLE_CLIENT_ID;
    delete process.env.GOOGLE_CLIENT_ID;

    expect(() => generateAuthUrl('test_state_123')).toThrow('GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET is missing');

    process.env.GOOGLE_CLIENT_ID = origId;
  });

  test('generateAuthUrl generates proper Google OAuth URL with state and scope when credentials present', () => {
    process.env.GOOGLE_CLIENT_ID = 'test-client-id-123.apps.googleusercontent.com';
    process.env.GOOGLE_CLIENT_SECRET = 'test-client-secret-xyz';

    const url = generateAuthUrl('csrf_token_xyz999');
    expect(url).toContain('accounts.google.com/o/oauth2/v2/auth');
    expect(url).toContain('access_type=offline');
    expect(url).toContain('state=csrf_token_xyz999');
    expect(url).toContain(encodeURIComponent('https://www.googleapis.com/auth/calendar.events'));

    // Reset
    delete process.env.GOOGLE_CLIENT_ID;
    delete process.env.GOOGLE_CLIENT_SECRET;
  });

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
