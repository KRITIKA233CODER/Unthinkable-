const express = require('express');
const router = express.Router();
const {
  holdSlot,
  bookAppointment,
  cancelAppointment,
  rescheduleAppointment,
  submitPostVisit,
  getMyAppointments
} = require('../controllers/appointmentController');
const { protect, authorize } = require('../middleware/authMiddleware');

// Patient holds an appointment slot temporarily (5 minutes)
router.post('/hold', protect, authorize('patient'), holdSlot);

// Patient confirms / books an appointment
router.post('/book', protect, authorize('patient'), bookAppointment);

// Cancel an appointment (patient or doctor)
router.put('/:id/cancel', protect, cancelAppointment);

// Reschedule an appointment (patient)
router.put('/:id/reschedule', protect, authorize('patient'), rescheduleAppointment);

// Doctor submits post-visit notes
router.post('/:id/post-visit', protect, authorize('doctor'), submitPostVisit);

// Get user's appointments (or all appointments for admin)
router.get('/my', protect, getMyAppointments);
router.get('/', protect, getMyAppointments);

module.exports = router;
