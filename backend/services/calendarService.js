const { google } = require('googleapis');
const fs = require('fs');
const path = require('path');

const REDIRECT_URI = 'http://localhost:5000/api/auth/google/callback';
const CALENDAR_SCOPE = ['https://www.googleapis.com/auth/calendar.events'];

// Runtime token cache (allows immediate use before/after file sync)
let runtimeTokens = null;

/**
 * Validates whether a credential string is real (not placeholder or empty).
 */
const isValidValue = (val, placeholder) => {
  return !!(val && val.trim() !== '' && !val.includes('your_') && val !== placeholder);
};

/**
 * Checks whether Google OAuth credentials (Client ID, Secret, and Refresh Token) are fully configured.
 */
const hasValidCredentials = () => {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const refreshToken = runtimeTokens?.refresh_token || process.env.GOOGLE_REFRESH_TOKEN;

  return (
    isValidValue(clientId, 'your_google_client_id') &&
    isValidValue(clientSecret, 'your_google_client_secret') &&
    isValidValue(refreshToken, 'your_google_refresh_token')
  );
};

/**
 * Creates and returns an OAuth2 client configured with credentials.
 */
const getOAuth2Client = () => {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const refreshToken = runtimeTokens?.refresh_token || process.env.GOOGLE_REFRESH_TOKEN;

  if (
    !isValidValue(clientId, 'your_google_client_id') ||
    !isValidValue(clientSecret, 'your_google_client_secret') ||
    !isValidValue(refreshToken, 'your_google_refresh_token')
  ) {
    return null;
  }

  try {
    const oauth2Client = new google.auth.OAuth2(
      clientId.trim(),
      clientSecret.trim(),
      REDIRECT_URI
    );

    oauth2Client.setCredentials({ refresh_token: refreshToken.trim() });
    return oauth2Client;
  } catch (err) {
    console.error('[CALENDAR_AUTH_ERROR] Could not initialize Google OAuth2 client:', err.message);
    return null;
  }
};

/**
 * Generates the Google OAuth 2.0 consent authorization URL with state protection.
 */
const generateAuthUrl = (state) => {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

  if (!isValidValue(clientId, 'your_google_client_id') || !isValidValue(clientSecret, 'your_google_client_secret')) {
    throw new Error('GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET is missing or not configured in backend/.env');
  }

  const oauth2Client = new google.auth.OAuth2(
    clientId.trim(),
    clientSecret.trim(),
    REDIRECT_URI
  );

  return oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: CALENDAR_SCOPE,
    include_granted_scopes: true,
    prompt: 'consent', // Guarantees returning a refresh_token during testing
    state
  });
};

/**
 * Exchanges authorization code for tokens and persists the refresh token.
 */
const exchangeCodeForTokens = async (code) => {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

  const oauth2Client = new google.auth.OAuth2(
    clientId.trim(),
    clientSecret.trim(),
    REDIRECT_URI
  );

  const { tokens } = await oauth2Client.getToken(code);
  
  if (tokens.refresh_token) {
    runtimeTokens = tokens;
    process.env.GOOGLE_REFRESH_TOKEN = tokens.refresh_token;
    persistRefreshTokenToEnv(tokens.refresh_token);
    console.log('[CALENDAR_AUTH] Google OAuth tokens acquired and refresh token persisted successfully.');
  } else {
    // If user re-authenticated without prompt, access_token is returned and existing refresh token remains active
    if (process.env.GOOGLE_REFRESH_TOKEN) {
      runtimeTokens = { ...tokens, refresh_token: process.env.GOOGLE_REFRESH_TOKEN };
    }
    console.log('[CALENDAR_AUTH] Google OAuth access token refreshed successfully.');
  }

  return { success: true };
};

/**
 * Safely persists the refresh token into backend/.env without altering other variables.
 */
const persistRefreshTokenToEnv = (refreshToken) => {
  try {
    const envPath = path.resolve(__dirname, '..', '.env');
    let envContent = '';

    if (fs.existsSync(envPath)) {
      envContent = fs.readFileSync(envPath, 'utf8');
    }

    if (envContent.includes('GOOGLE_REFRESH_TOKEN=')) {
      envContent = envContent.replace(
        /GOOGLE_REFRESH_TOKEN=.*/g,
        `GOOGLE_REFRESH_TOKEN=${refreshToken}`
      );
    } else {
      envContent = `${envContent.trim()}\nGOOGLE_REFRESH_TOKEN=${refreshToken}\n`;
    }

    fs.writeFileSync(envPath, envContent, 'utf8');
    console.log('[CALENDAR_AUTH] Refresh token safely persisted to backend/.env');
  } catch (err) {
    console.error('[CALENDAR_AUTH_ERROR] Failed to write refresh token to .env:', err.message);
  }
};

let lastCalendarError = null;

const getLastCalendarError = () => lastCalendarError;

/**
 * Creates a Google Calendar event for a booked appointment.
 * Returns eventId or null.
 */
const createCalendarEvent = async (appointment, patient, doctor) => {
  lastCalendarError = null;
  console.log('[CALENDAR_SERVICE] Attempting Google Calendar event creation');

  if (!hasValidCredentials()) {
    console.warn('[CALENDAR_SERVICE] Google Calendar OAuth credentials missing or incomplete. Skipping calendar event creation.');
    lastCalendarError = 'OAuth credentials missing or incomplete';
    return null;
  }

  const auth = getOAuth2Client();
  if (!auth) {
    console.warn('[CALENDAR_SERVICE] Google Calendar OAuth client initialization failed.');
    lastCalendarError = 'OAuth client initialization failed';
    return null;
  }

  const activeRefreshToken = runtimeTokens?.refresh_token || process.env.GOOGLE_REFRESH_TOKEN;
  if (activeRefreshToken) {
    auth.setCredentials({ refresh_token: activeRefreshToken.trim() });
  }

  try {
    const dateStr = new Date(appointment.date).toISOString().split('T')[0];
    let hours = 9;
    let minutes = 0;
    if (appointment.timeSlot) {
      const cleanSlot = String(appointment.timeSlot).trim();
      const isPM = /pm/i.test(cleanSlot);
      const isAM = /am/i.test(cleanSlot);
      const match = cleanSlot.match(/(\d+):(\d+)/);
      if (match) {
        hours = parseInt(match[1], 10);
        minutes = parseInt(match[2], 10);
        if (isPM && hours < 12) hours += 12;
        if (isAM && hours === 12) hours = 0;
      }
    }

    const pad = (n) => String(n).padStart(2, '0');
    const startDateTime = `${dateStr}T${pad(hours)}:${pad(minutes)}:00+05:30`;

    let endHours = hours;
    let endMinutes = minutes + 30;
    if (endMinutes >= 60) {
      endHours = (endHours + Math.floor(endMinutes / 60)) % 24;
      endMinutes = endMinutes % 60;
    }
    const endDateTime = `${dateStr}T${pad(endHours)}:${pad(endMinutes)}:00+05:30`;

    const attendees = [];
    if (patient?.email && patient.email.includes('@')) {
      attendees.push({ email: patient.email });
    }
    if (doctor?.email && doctor.email.includes('@')) {
      attendees.push({ email: doctor.email });
    }

    const event = {
      summary: `HealthPulse Appointment: ${patient?.name || 'Patient'} with ${doctor?.name || 'Doctor'}`,
      description: `Symptoms: ${appointment.symptoms || 'None specified'}\nAI Urgency: ${appointment.preVisitSummary?.urgencyLevel || 'Medium'}\nPlatform: HealthPulse AI`,
      start: {
        dateTime: startDateTime,
        timeZone: 'Asia/Kolkata',
      },
      end: {
        dateTime: endDateTime,
        timeZone: 'Asia/Kolkata',
      },
      attendees,
      reminders: {
        useDefault: false,
        overrides: [
          { method: 'email', minutes: 24 * 60 },
          { method: 'popup', minutes: 30 },
        ],
      },
    };

    console.log('[CALENDAR_DIAGNOSTICS] Event Payload to Insert:', JSON.stringify(event, null, 2));

    const calendar = google.calendar({ version: 'v3', auth });
    const response = await calendar.events.insert({
      calendarId: 'primary',
      resource: event,
    });

    const eventId = response.data.id;
    console.log(`[CALENDAR_SERVICE] Google Calendar event created successfully: ${eventId}`);
    return eventId;
  } catch (error) {
    console.error('[CALENDAR_DIAGNOSTICS] HTTP Status:', error.response?.status);
    console.error('[CALENDAR_DIAGNOSTICS] error.response.data:', JSON.stringify(error.response?.data, null, 2));
    console.error('[CALENDAR_DIAGNOSTICS] error.response.data.error:', error.response?.data?.error);
    console.error('[CALENDAR_DIAGNOSTICS] error.response.data.error_description:', error.response?.data?.error_description);
    console.error('[CALENDAR_DIAGNOSTICS] error.response.data.error.message:', error.response?.data?.error?.message);

    const isInvalidGrant = error.response?.data?.error === 'invalid_grant' || error.message === 'invalid_grant';
    const safeErrMsg = isInvalidGrant
      ? 'invalid_grant (OAuth refresh token invalid or revoked - reconnect Google Calendar in Integrations)'
      : (error.response?.data?.error_description || error.response?.data?.error?.message || error.message || 'Unknown calendar API error');

    console.error(`[CALENDAR_SERVICE] Calendar API failed: ${safeErrMsg}`);
    lastCalendarError = safeErrMsg;
    return null; // Graceful degradation - calendar error does not break appointment booking
  }
};

/**
 * Updates an existing Google Calendar event on reschedule.
 */
const updateCalendarEvent = async (eventId, appointment, patient, doctor) => {
  lastCalendarError = null;
  if (!eventId) {
    return null;
  }

  if (!hasValidCredentials()) {
    console.warn('[CALENDAR_SERVICE] Google Calendar credentials missing. Skipping calendar update.');
    lastCalendarError = 'OAuth credentials missing or incomplete';
    return null;
  }

  const auth = getOAuth2Client();
  if (!auth) {
    lastCalendarError = 'OAuth client initialization failed';
    return null;
  }

  const activeRefreshToken = runtimeTokens?.refresh_token || process.env.GOOGLE_REFRESH_TOKEN;
  if (activeRefreshToken) {
    auth.setCredentials({ refresh_token: activeRefreshToken.trim() });
  }

  try {
    console.log(`[CALENDAR_SERVICE] Attempting Google Calendar event update for event: ${eventId}`);
    const calendar = google.calendar({ version: 'v3', auth });

    let startDate = new Date(appointment.date);
    if (appointment.timeSlot) {
      const cleanSlot = String(appointment.timeSlot).trim();
      const isPM = /pm/i.test(cleanSlot);
      const isAM = /am/i.test(cleanSlot);
      const match = cleanSlot.match(/(\d+):(\d+)/);
      if (match) {
        let hours = parseInt(match[1], 10);
        const minutes = parseInt(match[2], 10);
        if (isPM && hours < 12) hours += 12;
        if (isAM && hours === 12) hours = 0;
        startDate.setHours(hours, minutes, 0, 0);
      }
    }
    const endDate = new Date(startDate.getTime() + 30 * 60000);

    const event = {
      start: {
        dateTime: startDate.toISOString(),
        timeZone: 'Asia/Kolkata',
      },
      end: {
        dateTime: endDate.toISOString(),
        timeZone: 'Asia/Kolkata',
      },
      description: `Symptoms: ${appointment.symptoms || 'N/A'}\nStatus: Rescheduled to ${appointment.timeSlot}`,
    };

    const response = await calendar.events.patch({
      calendarId: 'primary',
      eventId,
      resource: event,
      sendUpdates: 'all',
    });

    console.log(`[CALENDAR_SERVICE] Google Calendar event updated successfully: ${response.data.id}`);
    return response.data.id;
  } catch (error) {
    const safeErrMsg = error.response?.data?.error_description || error.response?.data?.error?.message || error.message || 'Unknown calendar API error';
    console.error(`[CALENDAR_SERVICE] Calendar API failed: ${safeErrMsg}`);
    lastCalendarError = safeErrMsg;
    return null;
  }
};

/**
 * Deletes a Google Calendar event on cancellation.
 */
const deleteCalendarEvent = async (eventId) => {
  lastCalendarError = null;
  if (!eventId) {
    return null;
  }

  if (!hasValidCredentials()) {
    return null;
  }

  const auth = getOAuth2Client();
  if (!auth) {
    return null;
  }

  const activeRefreshToken = runtimeTokens?.refresh_token || process.env.GOOGLE_REFRESH_TOKEN;
  if (activeRefreshToken) {
    auth.setCredentials({ refresh_token: activeRefreshToken.trim() });
  }

  try {
    console.log(`[CALENDAR_SERVICE] Attempting Google Calendar event deletion for event: ${eventId}`);
    const calendar = google.calendar({ version: 'v3', auth });
    await calendar.events.delete({
      calendarId: 'primary',
      eventId,
    });
    console.log(`[CALENDAR_SERVICE] Google Calendar event deleted successfully: ${eventId}`);
    return true;
  } catch (error) {
    const safeErrMsg = error.response?.data?.error_description || error.response?.data?.error?.message || error.message || 'Unknown calendar API error';
    console.error(`[CALENDAR_SERVICE] Calendar API failed: ${safeErrMsg}`);
    lastCalendarError = safeErrMsg;
    return null;
  }
};

module.exports = {
  REDIRECT_URI,
  CALENDAR_SCOPE,
  hasValidCredentials,
  getOAuth2Client,
  getLastCalendarError,
  generateAuthUrl,
  exchangeCodeForTokens,
  persistRefreshTokenToEnv,
  createCalendarEvent,
  updateCalendarEvent,
  deleteCalendarEvent,
};
