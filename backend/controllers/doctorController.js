const DoctorProfile = require('../models/DoctorProfile');
const Appointment = require('../models/Appointment');
const User = require('../models/User');
const NodeCache = require('node-cache');
const { sendDoctorLeaveCancellation } = require('../services/emailService');
const { deleteCalendarEvent } = require('../services/calendarService');
const cache = new NodeCache({ stdTTL: 600, useClones: false }); // cache for 10 minutes (disable deep cloning of Mongoose documents)

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

    const doctors = await DoctorProfile.find(filter).populate('user', 'name email').lean();
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
      if (appt.googleCalendarEventId) {
        deleteCalendarEvent(appt.googleCalendarEventId)
          .catch(err => console.error('Leave calendar delete error:', err.message));
        appt.googleCalendarEventId = undefined;
      }

      appt.status = 'Cancelled';
      await appt.save();

      if (appt.patient && appt.patient.email) {
        try {
          await sendDoctorLeaveCancellation(
            appt.patient.email,
            req.user.email,
            {
              date: appt.date.toISOString().split('T')[0],
              timeSlot: appt.timeSlot,
              symptoms: appt.symptoms
            },
            reason || 'Doctor personal leave'
          );
        } catch (emailErr) {
          console.error('[EMAIL_FAILED] Doctor leave notice:', emailErr.message);
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
  const { userId, name, email, password, specialization, workingHours, slotDuration } = req.body;

  try {
    let targetUserId = userId;

    // If userId not explicitly provided, create or lookup user by email
    if (!targetUserId) {
      if (!email || !name) {
        return res.status(400).json({ message: 'Please provide either userId or doctor name and email' });
      }

      let existingUser = await User.findOne({ email });
      if (existingUser) {
        if (existingUser.role !== 'doctor') {
          existingUser.role = 'doctor';
          await existingUser.save();
        }
        targetUserId = existingUser._id;
      } else {
        const newUser = await User.create({
          name,
          email,
          password: password || 'password123',
          role: 'doctor'
        });
        targetUserId = newUser._id;
      }
    } else {
      const user = await User.findById(targetUserId);
      if (!user) {
        return res.status(404).json({ message: 'User not found' });
      }
      if (user.role !== 'doctor') {
        return res.status(400).json({ message: 'User must have doctor role' });
      }
    }

    // Check if profile already exists
    const existingProfile = await DoctorProfile.findOne({ user: targetUserId });
    if (existingProfile) {
      return res.status(400).json({ message: 'Doctor profile already exists for this user' });
    }

    const doctorProfile = await DoctorProfile.create({
      user: targetUserId,
      specialization,
      workingHours: workingHours || { start: '09:00', end: '17:00' },
      slotDuration: slotDuration || 30
    });

    cache.flushAll();
    const populated = await DoctorProfile.findById(doctorProfile._id).populate('user', 'name email');
    res.status(201).json(populated);
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

/**
 * Helpers for dynamic time conversion and slot generation
 */
const parseTimeToMinutes = (timeStr) => {
  if (!timeStr) return 0;
  const clean = String(timeStr).trim();
  const isPM = /pm/i.test(clean);
  const isAM = /am/i.test(clean);

  const match = clean.match(/(\d+):(\d+)/);
  if (!match) return 0;

  let hours = parseInt(match[1], 10);
  const minutes = parseInt(match[2], 10);

  if (isPM && hours < 12) hours += 12;
  if (isAM && hours === 12) hours = 0;

  return hours * 60 + minutes;
};

const formatMinutesToTime = (totalMinutes) => {
  let hours = Math.floor(totalMinutes / 60) % 24;
  const minutes = totalMinutes % 60;
  const period = hours >= 12 ? 'PM' : 'AM';

  const displayHours = hours % 12 === 0 ? 12 : hours % 12;
  const padHours = String(displayHours).padStart(2, '0');
  const padMinutes = String(minutes).padStart(2, '0');

  return `${padHours}:${padMinutes} ${period}`;
};

// @desc    Get mathematically generated available slots for a doctor on a specific date
// @route   GET /api/doctors/:id/available-slots?date=YYYY-MM-DD
// @access  Public
const getAvailableSlots = async (req, res) => {
  const { id } = req.params;
  const { date } = req.query;

  if (!date) {
    return res.status(400).json({ message: 'Query parameter date is required (YYYY-MM-DD)' });
  }

  try {
    const doctorProfile = await DoctorProfile.findById(id).populate('user', 'name email');
    if (!doctorProfile) {
      return res.status(404).json({ message: 'Doctor profile not found' });
    }

    // 1. Check if doctor is on leave on this date
    const reqDateStr = new Date(date).toISOString().split('T')[0];
    const isLeave = doctorProfile.leaveDays.some((leave) => {
      const leaveDateStr = new Date(leave.date || leave).toISOString().split('T')[0];
      return leaveDateStr === reqDateStr;
    });

    if (isLeave) {
      return res.status(200).json({
        isLeave: true,
        message: 'Doctor is on leave on this date',
        slots: []
      });
    }

    // 2. Read working hours & slot duration
    const startStr = doctorProfile.workingHours?.start || '09:00';
    const endStr = doctorProfile.workingHours?.end || '17:00';
    const slotDuration = Number(doctorProfile.slotDuration) || 30;

    const startMinutes = parseTimeToMinutes(startStr);
    const endMinutes = parseTimeToMinutes(endStr);

    // 3. Generate all slots between start and end
    const allSlots = [];
    for (let m = startMinutes; m + slotDuration <= endMinutes; m += slotDuration) {
      allSlots.push(formatMinutesToTime(m));
    }

    // 4. Find existing non-cancelled bookings or active unexpired holds
    const startOfDay = new Date(date);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(date);
    endOfDay.setHours(23, 59, 59, 999);

    const blockingAppointments = await Appointment.find({
      doctor: doctorProfile._id,
      date: { $gte: startOfDay, $lte: endOfDay },
      $or: [
        { status: { $in: ['Scheduled', 'Completed'] } },
        { status: 'Held', holdExpiresAt: { $gt: new Date() } }
      ]
    });

    const bookedSlots = blockingAppointments.map((a) => a.timeSlot);

    // 5. Exclude booked or actively held slots
    const availableSlots = allSlots.filter((slot) => !bookedSlots.includes(slot));

    res.status(200).json({
      isLeave: false,
      message: availableSlots.length === 0 ? 'No slots available' : 'Available slots',
      doctor: {
        id: doctorProfile._id,
        name: doctorProfile.user?.name,
        specialization: doctorProfile.specialization,
        slotDuration,
        workingHours: { start: startStr, end: endStr }
      },
      totalGenerated: allSlots.length,
      bookedCount: bookedSlots.length,
      slots: availableSlots
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

module.exports = {
  getDoctors,
  getAvailableSlots,
  markLeave,
  createDoctorProfile,
  updateDoctorProfile,
  deleteDoctorProfile
};
