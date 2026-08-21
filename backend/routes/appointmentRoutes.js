const express = require('express');
const router = express.Router();
const {
  bookAppointment,
  cancelAppointment,
  rescheduleAppointment,
  submitPostVisit,
  getMyAppointments
} = require('../controllers/appointmentController');
const { protect, authorize } = require('../middleware/authMiddleware');

// Patient books an appointment
router.post('/book', protect, authorize('patient'), bookAppointment);

// Cancel an appointment (patient or doctor)
router.put('/:id/cancel', protect, cancelAppointment);

// Reschedule an appointment (patient)
router.put('/:id/reschedule', protect, authorize('patient'), rescheduleAppointment);

// Doctor submits post-visit notes
router.post('/:id/post-visit', protect, authorize('doctor'), submitPostVisit);

// Get current user's appointments
router.get('/my', protect, getMyAppointments);

module.exports = router;
