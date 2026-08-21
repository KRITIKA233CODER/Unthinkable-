const { google } = require('googleapis');

/**
 * Google Calendar Service
 * Uses OAuth 2.0 credentials from environment variables.
 * If credentials are missing, operations degrade gracefully (no crash).
 */

const getOAuth2Client = () => {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const refreshToken = process.env.GOOGLE_REFRESH_TOKEN;

  if (!clientId || !clientSecret) {
    return null;
  }

  const oauth2Client = new google.auth.OAuth2(
    clientId,
    clientSecret,
    'http://localhost:5000/api/auth/google/callback'
  );

  if (refreshToken) {
    oauth2Client.setCredentials({ refresh_token: refreshToken });
  }

  return oauth2Client;
};

/**
 * Creates a Google Calendar event for a booked appointment.
 * Graceful fallback if OAuth credentials are missing.
 */
const createCalendarEvent = async (appointment, patient, doctor) => {
  const auth = getOAuth2Client();
  if (!auth) {
    console.warn('Google Calendar credentials missing. Skipping calendar sync.');
    return null;
  }

  try {
    const calendar = google.calendar({ version: 'v3', auth });

    const event = {
      summary: `Healthcare Appointment — ${patient.name} with ${doctor.name}`,
      description: `Symptoms: ${appointment.symptoms}\nUrgency: ${appointment.preVisitSummary?.urgencyLevel || 'N/A'}`,
      start: {
        dateTime: new Date(appointment.date).toISOString(),
        timeZone: 'Asia/Kolkata',
      },
      end: {
        // Default 30-minute appointment
        dateTime: new Date(new Date(appointment.date).getTime() + 30 * 60000).toISOString(),
        timeZone: 'Asia/Kolkata',
      },
      attendees: [
        { email: patient.email },
        { email: doctor.email },
      ],
    };

    const response = await calendar.events.insert({
      calendarId: 'primary',
      resource: event,
      sendUpdates: 'all',
    });

    console.log('Google Calendar event created:', response.data.id);
    return response.data.id;
  } catch (error) {
    console.error('Google Calendar create error:', error.message);
    return null; // Graceful - calendar failure does not crash the booking
  }
};

/**
 * Deletes a Google Calendar event on cancellation.
 */
const deleteCalendarEvent = async (eventId) => {
  const auth = getOAuth2Client();
  if (!auth || !eventId) {
    return null;
  }

  try {
    const calendar = google.calendar({ version: 'v3', auth });
    await calendar.events.delete({
      calendarId: 'primary',
      eventId,
    });
    console.log('Google Calendar event deleted:', eventId);
    return true;
  } catch (error) {
    console.error('Google Calendar delete error:', error.message);
    return null;
  }
};

module.exports = {
  createCalendarEvent,
  deleteCalendarEvent,
};
