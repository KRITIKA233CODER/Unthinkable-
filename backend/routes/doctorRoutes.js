const express = require('express');
const router = express.Router();
const {
  getDoctors,
  getAvailableSlots,
  markLeave,
  createDoctorProfile,
  updateDoctorProfile,
  deleteDoctorProfile
} = require('../controllers/doctorController');
const { protect, authorize } = require('../middleware/authMiddleware');

// Public — search doctors (supports ?specialization=Cardiology)
router.get('/', getDoctors);

// Public — dynamically generated available slots for doctor & date
router.get('/:id/available-slots', getAvailableSlots);

// Doctor marks their own leave day
router.post('/leave', protect, authorize('doctor'), markLeave);

// Admin CRUD for doctor profiles
router.post('/', protect, authorize('admin'), createDoctorProfile);
router.put('/:id', protect, authorize('admin'), updateDoctorProfile);
router.delete('/:id', protect, authorize('admin'), deleteDoctorProfile);

module.exports = router;
