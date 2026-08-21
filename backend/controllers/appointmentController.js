const Appointment = require('../models/Appointment');
const DoctorProfile = require('../models/DoctorProfile');
const mongoose = require('mongoose');
const { generatePreVisitSummary, generatePostVisitSummary } = require('../services/aiService');
const { sendBookingConfirmation } = require('../services/emailService');
const { createCalendarEvent, deleteCalendarEvent } = require('../services/calendarService');

// @desc    Book an appointment with AI Pre-Visit Summary
// @route   POST /api/appointments/book
// @access  Private (Patient)
const bookAppointment = async (req, res) => {
  const { doctorId, date, timeSlot, symptoms } = req.body;
  const patientId = req.user.id;

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    // 1. Verify doctor exists
    const doctor = await DoctorProfile.findById(doctorId).populate('user', 'name email').session(session);
    if (!doctor) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({ message: 'Doctor not found' });
    }

    // 2. Check for doctor leave on this date
    const bookingDate = new Date(date).toISOString().split('T')[0];
    const isLeave = doctor.leaveDays.some(leave =>
      leave.date.toISOString().split('T')[0] === bookingDate
    );
    if (isLeave) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({ message: 'Doctor is on leave on this date' });
    }

    // 3. Generate AI Pre-Visit Summary (graceful fallback inside aiService)
    const aiPreVisit = await generatePreVisitSummary(symptoms);

    // 4. Create appointment inside transaction
    const appointment = await Appointment.create([{
      patient: patientId,
      doctor: doctorId,
      date,
      timeSlot,
      symptoms,
      preVisitSummary: {
        urgencyLevel: aiPreVisit.urgencyLevel || 'Medium',
        chiefComplaint: aiPreVisit.chiefComplaint || symptoms,
        suggestedQuestions: aiPreVisit.suggestedQuestions || []
      }
    }], { session });

    await session.commitTransaction();
    session.endSession();

    // 5. Send confirmation email to both patient and doctor (async, non-blocking)
    const appointmentData = {
      date: bookingDate,
      timeSlot,
      symptoms,
      urgencyLevel: aiPreVisit.urgencyLevel || 'Medium'
    };
    sendBookingConfirmation(req.user.email, doctor.user.email, appointmentData)
      .catch(err => console.error('Email send failed (non-blocking):', err.message));

    // 6. Create Google Calendar events (async, non-blocking)
    createCalendarEvent(appointment[0], req.user, doctor.user)
      .catch(err => console.error('Calendar sync failed (non-blocking):', err.message));

    res.status(201).json(appointment[0]);
  } catch (error) {
    await session.abortTransaction();
    session.endSession();

    if (error.code === 11000) {
      return res.status(409).json({ message: 'This time slot is already booked.' });
    }

    res.status(500).json({ message: error.message });
  }
};

// @desc    Cancel an appointment
// @route   PUT /api/appointments/:id/cancel
// @access  Private (Patient or Doctor)
const cancelAppointment = async (req, res) => {
  try {
    const appointment = await Appointment.findById(req.params.id)
      .populate('patient', 'name email')
      .populate({ path: 'doctor', populate: { path: 'user', select: 'name email' } });

    if (!appointment) {
      return res.status(404).json({ message: 'Appointment not found' });
    }

    if (appointment.status === 'Cancelled') {
      return res.status(400).json({ message: 'Appointment is already cancelled' });
    }

    appointment.status = 'Cancelled';
    await appointment.save();

    // Send cancellation email to both parties
    const cancelData = {
      date: appointment.date.toISOString().split('T')[0],
      timeSlot: appointment.timeSlot,
      symptoms: 'CANCELLED — This appointment has been cancelled.',
      urgencyLevel: 'N/A'
    };
    sendBookingConfirmation(appointment.patient.email, appointment.doctor.user.email, cancelData)
      .catch(err => console.error('Cancel email failed (non-blocking):', err.message));

    // Delete Google Calendar event if exists
    if (appointment.googleCalendarEventId) {
      deleteCalendarEvent(appointment.googleCalendarEventId)
        .catch(err => console.error('Calendar delete failed (non-blocking):', err.message));
    }

    res.status(200).json({ message: 'Appointment cancelled successfully', appointment });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Reschedule an appointment
// @route   PUT /api/appointments/:id/reschedule
// @access  Private (Patient)
const rescheduleAppointment = async (req, res) => {
  const { date, timeSlot } = req.body;

  try {
    const appointment = await Appointment.findById(req.params.id);
    if (!appointment) {
      return res.status(404).json({ message: 'Appointment not found' });
    }

    if (appointment.status !== 'Scheduled') {
      return res.status(400).json({ message: 'Only scheduled appointments can be rescheduled' });
    }

    // Check the new slot is available using the unique index
    const existingSlot = await Appointment.findOne({
      doctor: appointment.doctor,
      date: new Date(date),
      timeSlot,
      status: { $ne: 'Cancelled' }
    });

    if (existingSlot) {
      return res.status(409).json({ message: 'New time slot is already booked' });
    }

    appointment.date = new Date(date);
    appointment.timeSlot = timeSlot;
    await appointment.save();

    res.status(200).json({ message: 'Appointment rescheduled successfully', appointment });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({ message: 'New time slot is already booked.' });
    }
    res.status(500).json({ message: error.message });
  }
};

// @desc    Submit Post-Visit Notes & Generate AI Patient Summary
// @route   POST /api/appointments/:id/post-visit
// @access  Private (Doctor)
const submitPostVisit = async (req, res) => {
  const { clinicalNotes } = req.body;
  const { id } = req.params;

  try {
    const appointment = await Appointment.findById(id);
    if (!appointment) {
      return res.status(404).json({ message: 'Appointment not found' });
    }

    // Generate AI Patient-Friendly Summary
    const aiPostVisit = await generatePostVisitSummary(clinicalNotes);

    appointment.status = 'Completed';
    appointment.postVisitSummary = {
      clinicalNotes,
      patientSummary: aiPostVisit.patientSummary || clinicalNotes,
      medicationSchedule: aiPostVisit.medicationSchedule || 'Follow doctor instructions.',
      followUpSteps: aiPostVisit.followUpSteps || 'Follow up as needed.'
    };

    await appointment.save();

    res.status(200).json(appointment);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Get user appointments
// @route   GET /api/appointments/my
// @access  Private
const getMyAppointments = async (req, res) => {
  try {
    let query = {};
    if (req.user.role === 'patient') {
      query.patient = req.user.id;
    } else if (req.user.role === 'doctor') {
      const doctorProfile = await DoctorProfile.findOne({ user: req.user.id });
      if (doctorProfile) {
        query.doctor = doctorProfile._id;
      }
    }

    const appointments = await Appointment.find(query)
      .populate('patient', 'name email')
      .populate({
        path: 'doctor',
        populate: { path: 'user', select: 'name email' }
      })
      .sort({ date: 1 });

    res.status(200).json(appointments);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

module.exports = {
  bookAppointment,
  cancelAppointment,
  rescheduleAppointment,
  submitPostVisit,
  getMyAppointments
};
