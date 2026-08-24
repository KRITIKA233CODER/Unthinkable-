const express = require('express');
const dotenv = require('dotenv');
const cors = require('cors');
const connectDB = require('./config/db');

// Load environment variables
dotenv.config();

// Connect to database
connectDB();

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// Health check endpoint for deployment monitoring
app.get('/api/health', (req, res) => {
  res.status(200).json({ status: 'healthy', timestamp: new Date().toISOString() });
});

// Safe configuration audit endpoint (Never reveals secrets)
app.get('/api/config-status', (req, res) => {
  const isSet = (val, placeholder) => {
    return !!(val && val.trim() !== '' && !val.includes('your_') && val !== placeholder);
  };

  const gemini = isSet(process.env.GEMINI_API_KEY, 'your_google_gemini_api_key_here');
  
  const emailUser = process.env.EMAIL_USER;
  const emailPass = process.env.EMAIL_PASS;
  const emailService = process.env.EMAIL_SERVICE || 'gmail';
  const email = isSet(emailUser, 'your_email@gmail.com') && isSet(emailPass, 'your_email_app_password');

  const calendarService = require('./services/calendarService');
  const googleClientIdDetected = isSet(process.env.GOOGLE_CLIENT_ID, 'your_google_client_id');
  const googleClientSecretDetected = isSet(process.env.GOOGLE_CLIENT_SECRET, 'your_google_client_secret');
  const googleRefreshTokenDetected = isSet(process.env.GOOGLE_REFRESH_TOKEN, 'your_google_refresh_token');
  const calendarReady = calendarService.hasValidCredentials();

  const mongoose = require('mongoose');
  const dbConnected = mongoose.connection.readyState === 1;

  res.status(200).json({
    gemini: gemini ? 'CONFIGURED' : 'MISSING',
    email: email ? `CONFIGURED (${emailService.toUpperCase()} SMTP)` : 'ETHEREAL_FALLBACK',
    googleOAuth: {
      clientId: googleClientIdDetected ? 'DETECTED' : 'MISSING',
      clientSecret: googleClientSecretDetected ? 'DETECTED' : 'MISSING',
      refreshToken: googleRefreshTokenDetected ? 'DETECTED' : 'AWAITING_OAUTH_CONSENT',
      status: calendarReady ? 'CONFIGURED' : (googleClientIdDetected && googleClientSecretDetected ? 'READY_TO_CONNECT' : 'MISSING')
    },
    googleCalendar: calendarReady ? 'CONFIGURED' : (googleClientIdDetected && googleClientSecretDetected ? 'READY_TO_CONNECT' : 'MISSING'),
    database: dbConnected ? 'CONNECTED' : 'DISCONNECTED',
    timestamp: new Date().toISOString()
  });
});

// Routes
app.use('/api/auth', require('./routes/authRoutes'));
app.use('/api/appointments', require('./routes/appointmentRoutes'));
app.use('/api/doctors', require('./routes/doctorRoutes'));

const { initCronJobs } = require('./services/cronService');

// Start background cron jobs
initCronJobs();

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
