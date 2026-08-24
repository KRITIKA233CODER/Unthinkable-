const crypto = require('crypto');
const User = require('../models/User');
const jwt = require('jsonwebtoken');
const calendarService = require('../services/calendarService');

// In-memory OAuth state registry for CSRF protection (10-minute TTL)
const oauthStateMap = new Map();

// Helper to clean up expired states periodically
setInterval(() => {
  const now = Date.now();
  for (const [state, expiry] of oauthStateMap.entries()) {
    if (now > expiry) {
      oauthStateMap.delete(state);
    }
  }
}, 60 * 1000);

// Generate JWT
const generateToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET, {
    expiresIn: '30d',
  });
};

// @desc    Register a new user
// @route   POST /api/auth/register
// @access  Public
const registerUser = async (req, res) => {
  const { name, email, password, role } = req.body;

  try {
    const userExists = await User.findOne({ email });

    if (userExists) {
      return res.status(400).json({ message: 'User already exists' });
    }

    const user = await User.create({
      name,
      email,
      password,
      role: role || 'patient',
    });

    if (user) {
      res.status(201).json({
        _id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        token: generateToken(user._id),
      });
    } else {
      res.status(400).json({ message: 'Invalid user data' });
    }
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Authenticate a user
// @route   POST /api/auth/login
// @access  Public
const loginUser = async (req, res) => {
  const { email, password } = req.body;

  try {
    const user = await User.findOne({ email });

    if (user && (await user.matchPassword(password))) {
      res.json({
        _id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        token: generateToken(user._id),
      });
    } else {
      res.status(401).json({ message: 'Invalid email or password' });
    }
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Get user data
// @route   GET /api/auth/me
// @access  Private
const getMe = async (req, res) => {
  res.status(200).json(req.user);
};

// @desc    Initiate Google Calendar OAuth 2.0 Flow
// @route   GET /api/auth/google
// @access  Public
const getGoogleAuthUrl = async (req, res) => {
  try {
    // Generate cryptographically secure CSRF state
    const state = crypto.randomBytes(32).toString('hex');
    oauthStateMap.set(state, Date.now() + 10 * 60 * 1000); // 10-minute expiry

    const authUrl = calendarService.generateAuthUrl(state);

    // If client requested direct redirect, redirect immediately
    if (req.query.redirect === 'true') {
      return res.redirect(authUrl);
    }

    res.status(200).json({ authUrl, state });
  } catch (error) {
    console.error('[GOOGLE_AUTH_ERROR]', error.message);
    res.status(500).json({ message: error.message });
  }
};

// @desc    Handle Google Calendar OAuth 2.0 Callback
// @route   GET /api/auth/google/callback
// @access  Public
const handleGoogleCallback = async (req, res) => {
  const { code, state, error } = req.query;

  // 1. Check for provider error
  if (error) {
    console.error('[GOOGLE_OAUTH_CALLBACK_ERROR] Provider error:', error);
    return res.redirect(`http://localhost:5173/?calendar_auth=failed&error=${encodeURIComponent(error)}`);
  }

  // 2. Validate cryptographic state parameter (CSRF protection)
  if (!state || !oauthStateMap.has(state)) {
    console.error('[GOOGLE_OAUTH_CALLBACK_ERROR] State parameter invalid or expired.');
    return res.redirect('http://localhost:5173/?calendar_auth=failed&error=invalid_state');
  }

  const expiry = oauthStateMap.get(state);
  oauthStateMap.delete(state); // Consume state (single-use)

  if (Date.now() > expiry) {
    console.error('[GOOGLE_OAUTH_CALLBACK_ERROR] State parameter expired.');
    return res.redirect('http://localhost:5173/?calendar_auth=failed&error=state_expired');
  }

  // 3. Exchange code for access & refresh tokens
  if (!code) {
    console.error('[GOOGLE_OAUTH_CALLBACK_ERROR] Authorization code missing.');
    return res.redirect('http://localhost:5173/?calendar_auth=failed&error=missing_code');
  }

  try {
    await calendarService.exchangeCodeForTokens(code);
    return res.redirect('http://localhost:5173/?calendar_auth=success');
  } catch (tokenErr) {
    console.error('[GOOGLE_OAUTH_CALLBACK_ERROR] Token exchange failed:', tokenErr.message);
    return res.redirect(`http://localhost:5173/?calendar_auth=failed&error=${encodeURIComponent(tokenErr.message)}`);
  }
};

// @desc    Check Google Calendar OAuth Connection Status
// @route   GET /api/auth/google/status
// @access  Public
const getGoogleCalendarStatus = (req, res) => {
  const isConnected = calendarService.hasValidCredentials();
  res.status(200).json({ isConnected });
};

module.exports = {
  registerUser,
  loginUser,
  getMe,
  getGoogleAuthUrl,
  handleGoogleCallback,
  getGoogleCalendarStatus,
};
