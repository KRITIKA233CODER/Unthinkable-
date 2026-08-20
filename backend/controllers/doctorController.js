const DoctorProfile = require('../models/DoctorProfile');
const Appointment = require('../models/Appointment');
const User = require('../models/User');
const NodeCache = require('node-cache');
const { sendBookingConfirmation } = require('../services/emailService');
const cache = new NodeCache({ stdTTL: 600 }); // cache for 10 minutes

// @desc    Get all doctors, optionally filter by specialization
// @route   GET /api/doctors?specialization=Cardiology
// @access  Public
const getDoctors = async (req, res) => {
  try {
    const { specialization } = req.query;
    const cacheKey = specialization ? `doctors_${specialization}` : 'all_doctors';
    const cachedDoctors = cache.get(cacheKey);

    if (cachedDoctors) {
      return res.status(200).json(cachedDoctors);
    }

    // Build filter query
    const filter = specialization
      ? { specialization: { $regex: specialization, $options: 'i' } }
      : {};

    const doctors = await DoctorProfile.find(filter).populate('user', 'name email');
    cache.set(cacheKey, doctors);

    res.status(200).json(doctors);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Mark a leave day for a doctor & notify affected patients
// @route   POST /api/doctors/leave
// @access  Private (Doctor)
const markLeave = async (req, res) => {
  const { date, reason } = req.body;

  try {
    const doctorProfile = await DoctorProfile.findOne({ user: req.user.id });
    if (!doctorProfile) {
      return res.status(404).json({ message: 'Doctor profile not found' });
    }

    doctorProfile.leaveDays.push({ date: new Date(date), reason });
    await doctorProfile.save();

    // Invalidate cache so stale availability is never served
    cache.flushAll();

    // Find all existing appointments on this leave date and notify patients
    const leaveDate = new Date(date);
    const startOfDay = new Date(leaveDate.setHours(0, 0, 0, 0));
    const endOfDay = new Date(leaveDate.setHours(23, 59, 59, 999));

    const affectedAppointments = await Appointment.find({
      doctor: doctorProfile._id,
      date: { $gte: startOfDay, $lte: endOfDay },
      status: 'Scheduled'
    }).populate('patient', 'name email');

    // Update each affected appointment to cancelled and email the patient
    for (const appt of affectedAppointments) {
      appt.status = 'Cancelled';
      await appt.save();

      if (appt.patient && appt.patient.email) {
        try {
          await sendBookingConfirmation(
            appt.patient.email,
            req.user.email,
            {
              date: appt.date.toISOString().split('T')[0],
              timeSlot: appt.timeSlot,
              symptoms: `CANCELLED — Doctor on leave (${reason || 'Personal'}). Please reschedule.`,
              urgencyLevel: appt.preVisitSummary?.urgencyLevel || 'N/A'
            }
          );
        } catch (emailErr) {
          console.error('Failed to notify patient:', emailErr.message);
          // Graceful — email failure does not crash the leave operation
        }
      }
    }

    res.status(200).json({
      message: `Leave marked. ${affectedAppointments.length} affected patient(s) notified.`,
      affectedCount: affectedAppointments.length,
      doctorProfile
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Admin creates a new doctor profile
// @route   POST /api/doctors
// @access  Private (Admin)
const createDoctorProfile = async (req, res) => {
  const { userId, specialization, workingHours, slotDuration } = req.body;

  try {
    // Verify the user exists and has role "doctor"
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    if (user.role !== 'doctor') {
      return res.status(400).json({ message: 'User must have doctor role' });
    }

    // Check if profile already exists
    const existingProfile = await DoctorProfile.findOne({ user: userId });
    if (existingProfile) {
      return res.status(400).json({ message: 'Doctor profile already exists for this user' });
    }

    const doctorProfile = await DoctorProfile.create({
      user: userId,
      specialization,
      workingHours: workingHours || { start: '09:00', end: '17:00' },
      slotDuration: slotDuration || 30
    });

    cache.flushAll();
    res.status(201).json(doctorProfile);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Admin updates a doctor profile
// @route   PUT /api/doctors/:id
// @access  Private (Admin)
const updateDoctorProfile = async (req, res) => {
  const { specialization, workingHours, slotDuration } = req.body;

  try {
    const doctorProfile = await DoctorProfile.findById(req.params.id);
    if (!doctorProfile) {
      return res.status(404).json({ message: 'Doctor profile not found' });
    }

    if (specialization) doctorProfile.specialization = specialization;
    if (workingHours) doctorProfile.workingHours = workingHours;
    if (slotDuration) doctorProfile.slotDuration = slotDuration;

    await doctorProfile.save();
    cache.flushAll();

    res.status(200).json(doctorProfile);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Admin deletes a doctor profile
// @route   DELETE /api/doctors/:id
// @access  Private (Admin)
const deleteDoctorProfile = async (req, res) => {
  try {
    const doctorProfile = await DoctorProfile.findById(req.params.id);
    if (!doctorProfile) {
      return res.status(404).json({ message: 'Doctor profile not found' });
    }

    await DoctorProfile.findByIdAndDelete(req.params.id);
    cache.flushAll();

    res.status(200).json({ message: 'Doctor profile removed successfully' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

module.exports = {
  getDoctors,
  markLeave,
  createDoctorProfile,
  updateDoctorProfile,
  deleteDoctorProfile
};
