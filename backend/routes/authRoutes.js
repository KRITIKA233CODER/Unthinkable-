const express = require('express');
const router = express.Router();
const {
  registerUser,
  loginUser,
  getMe,
  getGoogleAuthUrl,
  handleGoogleCallback,
  getGoogleCalendarStatus
} = require('../controllers/authController');
const { protect } = require('../middleware/authMiddleware');

// Standard user auth
router.post('/register', registerUser);
router.post('/login', loginUser);
router.get('/me', protect, getMe);

// Google Calendar OAuth 2.0 Flow
router.get('/google', getGoogleAuthUrl);
router.get('/google/callback', handleGoogleCallback);
router.get('/google/status', getGoogleCalendarStatus);

module.exports = router;
