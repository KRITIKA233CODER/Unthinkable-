const Appointment = require('../models/Appointment');
const DoctorProfile = require('../models/DoctorProfile');
const ReminderJob = require('../models/ReminderJob');
const mongoose = require('mongoose');
const { generatePreVisitSummary, generatePostVisitSummary } = require('../services/aiService');
const {
  sendBookingConfirmation,
  sendCancellationEmail,
  sendRescheduleEmail
} = require('../services/emailService');
const { createCalendarEvent, updateCalendarEvent, deleteCalendarEvent, getLastCalendarError } = require('../services/calendarService');

// @desc    Hold an appointment slot for 5 minutes
// @route   POST /api/appointments/hold
// @access  Private (Patient)
const holdSlot = async (req, res) => {
  const { doctorId, date, timeSlot } = req.body;
  const patientId = req.user.id;

  if (!doctorId || !date || !timeSlot) {
    return res.status(400).json({ message: 'doctorId, date, and timeSlot are required' });
  }

  try {
    // 1. Verify doctor exists
    const doctor = await DoctorProfile.findById(doctorId);
    if (!doctor) {
      return res.status(404).json({ message: 'Doctor not found' });
    }

    // 2. Check for doctor leave on this date
    const bookingDateStr = new Date(date).toISOString().split('T')[0];
    const isLeave = doctor.leaveDays.some((leave) => {
      const leaveDateStr = new Date(leave.date || leave).toISOString().split('T')[0];
      return leaveDateStr === bookingDateStr;
    });

    if (isLeave) {
      return res.status(400).json({ message: 'Doctor is on leave on this date' });
    }

    // 3. Find any existing appointment for this exact slot
    const startOfDay = new Date(date);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(date);
    endOfDay.setHours(23, 59, 59, 999);

    const existingAppt = await Appointment.findOne({
      doctor: doctorId,
      date: { $gte: startOfDay, $lte: endOfDay },
      timeSlot
    });

    if (existingAppt) {
      if (existingAppt.status === 'Scheduled' || existingAppt.status === 'Completed') {
        return res.status(409).json({ message: 'This time slot is already booked.' });
      }

      if (existingAppt.status === 'Held') {
        const now = new Date();
        if (existingAppt.holdExpiresAt && existingAppt.holdExpiresAt > now) {
          // If held by someone else
          if (existingAppt.patient.toString() !== patientId) {
            return res.status(409).json({
              message: 'This slot is temporarily held by another patient. Please try again in a few minutes.'
            });
          }

          // Held by same patient -> extend and return existing hold
          existingAppt.holdExpiresAt = new Date(Date.now() + 5 * 60 * 1000);
          await existingAppt.save();

          return res.status(200).json({
            message: 'Slot hold extended',
            holdId: existingAppt._id,
            holdExpiresAt: existingAppt.holdExpiresAt,
            expiresInSeconds: 300,
            doctorId,
            date,
            timeSlot
          });
        }

        // Expired hold -> remove it to free the index
        await Appointment.deleteOne({ _id: existingAppt._id });
      }
    }

    // 4. Create new temporary hold (5 minutes expiration)
    const holdExpiry = new Date(Date.now() + 5 * 60 * 1000);
    const newHold = await Appointment.create({
      patient: patientId,
      doctor: doctorId,
      date: new Date(date),
      timeSlot,
      status: 'Held',
      holdExpiresAt: holdExpiry,
      symptoms: 'Pending confirmation'
    });

    res.status(201).json({
      message: 'Slot held successfully for 5 minutes',
      holdId: newHold._id,
      holdExpiresAt: holdExpiry,
      expiresInSeconds: 300,
      doctorId,
      date,
      timeSlot
    });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({ message: 'This slot is currently held or booked by another user.' });
    }

    res.status(500).json({ message: error.message });
  }
};

// @desc    Confirm / Book an appointment (converts valid hold to Scheduled or direct booking)
// @route   POST /api/appointments/book
// @access  Private (Patient)
const bookAppointment = async (req, res) => {
  const { holdId, doctorId, date, timeSlot, symptoms } = req.body;
  const patientId = req.user.id;

  try {
    let appointment;
    let doctor;

    // A) If booking with a valid hold ID
    if (holdId) {
      appointment = await Appointment.findById(holdId);
      if (!appointment) {
        return res.status(404).json({ message: 'Hold reservation not found.' });
      }

      if (appointment.patient.toString() !== patientId) {
        return res.status(403).json({ message: 'You do not own this slot reservation.' });
      }

      if (appointment.status !== 'Held') {
        return res.status(400).json({ message: 'This appointment is already confirmed or processed.' });
      }

      if (appointment.holdExpiresAt && appointment.holdExpiresAt <= new Date()) {
        return res.status(409).json({ message: 'Slot hold has expired. Please reselect an available slot.' });
      }

      doctor = await DoctorProfile.findById(appointment.doctor).populate('user', 'name email');

      // Generate AI Pre-Visit Summary (graceful fallback)
      const aiPreVisit = await generatePreVisitSummary(symptoms || appointment.symptoms);

      appointment.status = 'Scheduled';
      appointment.holdExpiresAt = undefined;
      appointment.symptoms = symptoms || appointment.symptoms;
      appointment.preVisitSummary = {
        urgencyLevel: aiPreVisit.urgencyLevel || 'Medium',
        chiefComplaint: aiPreVisit.chiefComplaint || symptoms,
        suggestedQuestions: aiPreVisit.suggestedQuestions || [],
        isFallback: aiPreVisit.isFallback
      };

      await appointment.save();
    } else {
      // B) Direct booking without pre-existing hold
      doctor = await DoctorProfile.findById(doctorId).populate('user', 'name email');
      if (!doctor) {
        return res.status(404).json({ message: 'Doctor not found' });
      }

      const bookingDateStr = new Date(date).toISOString().split('T')[0];
      const isLeave = doctor.leaveDays.some((leave) => {
        const leaveDateStr = new Date(leave.date || leave).toISOString().split('T')[0];
        return leaveDateStr === bookingDateStr;
      });

      if (isLeave) {
        return res.status(400).json({ message: 'Doctor is on leave on this date' });
      }

      const aiPreVisit = await generatePreVisitSummary(symptoms);

      const created = await Appointment.create({
        patient: patientId,
        doctor: doctorId,
        date: new Date(date),
        timeSlot,
        symptoms,
        status: 'Scheduled',
        preVisitSummary: {
          urgencyLevel: aiPreVisit.urgencyLevel || 'Medium',
          chiefComplaint: aiPreVisit.chiefComplaint || symptoms,
          suggestedQuestions: aiPreVisit.suggestedQuestions || [],
          isFallback: aiPreVisit.isFallback
        }
      });

      appointment = created;
    }

    // 1. Send confirmation email (Nodemailer status tracked)
    const bookingDateFormatted = new Date(appointment.date).toISOString().split('T')[0];
    const appointmentData = {
      date: bookingDateFormatted,
      timeSlot: appointment.timeSlot,
      symptoms: appointment.symptoms,
      urgencyLevel: appointment.preVisitSummary?.urgencyLevel || 'Medium'
    };

    let emailResult = {
      status: 'EMAIL_NOT_CONFIGURED',
      message: 'No recipient email addresses provided.'
    };

    if (req.user?.email || doctor?.user?.email) {
      try {
        const mailRes = await sendBookingConfirmation(req.user.email, doctor?.user?.email, appointmentData);
        emailResult = {
          status: mailRes?.status || 'EMAIL_SENT',
          type: mailRes?.type || 'SMTP',
          previewUrl: mailRes?.previewUrl,
          message: mailRes?.status === 'EMAIL_SENT' 
            ? (mailRes?.type === 'SMTP' ? 'Confirmation email dispatched via SMTP' : 'Confirmation email sent to test inbox (Ethereal)')
            : (mailRes?.message || 'Email sending failed'),
          messageId: mailRes?.messageId
        };
      } catch (mailErr) {
        console.error('[EMAIL_FAILED] Booking confirmation:', mailErr.message);
        emailResult = {
          status: 'EMAIL_FAILED',
          message: mailErr.message
        };
      }
    }

    // 2. Google Calendar Synchronization
    let calendarResult = {
      success: false,
      message: 'Google Calendar synchronization skipped'
    };

    try {
      const eventId = await createCalendarEvent(appointment, req.user, doctor?.user);
      if (eventId) {
        appointment.googleCalendarEventId = eventId;
        await Appointment.findByIdAndUpdate(appointment._id, { googleCalendarEventId: eventId });
        calendarResult = {
          success: true,
          eventId,
          message: 'Google Calendar event created successfully'
        };
      } else {
        const lastErr = getLastCalendarError();
        calendarResult = {
          success: false,
          message: lastErr ? `Google Calendar synchronization skipped (${lastErr})` : 'Google Calendar synchronization skipped'
        };
      }
    } catch (calErr) {
      console.error('[CALENDAR_FAILED] Booking calendar sync:', calErr.message);
      calendarResult = {
        success: false,
        message: `Calendar sync failed: ${calErr.message}`
      };
    }

    res.status(201).json({
      appointment,
      email: emailResult,
      calendar: calendarResult
    });
  } catch (error) {
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

    const previousEventId = appointment.googleCalendarEventId;

    appointment.status = 'Cancelled';
    appointment.googleCalendarEventId = undefined;
    await appointment.save();

    // 1. Send cancellation email
    const cancelData = {
      date: appointment.date.toISOString().split('T')[0],
      timeSlot: appointment.timeSlot,
      symptoms: appointment.symptoms || 'Appointment cancelled',
      urgencyLevel: 'N/A'
    };

    let emailResult = {
      status: 'EMAIL_NOT_CONFIGURED',
      message: 'No recipient email addresses provided.'
    };

    if (appointment.patient?.email || appointment.doctor?.user?.email) {
      try {
        const mailRes = await sendCancellationEmail(
          appointment.patient?.email,
          appointment.doctor?.user?.email,
          cancelData,
          'Cancelled by patient/clinic'
        );
        emailResult = {
          status: mailRes?.status || 'EMAIL_SENT',
          message: mailRes?.status === 'EMAIL_SENT' ? 'Cancellation email sent' : mailRes?.message,
          messageId: mailRes?.messageId
        };
      } catch (mailErr) {
        console.error('[EMAIL_FAILED] Cancellation email:', mailErr.message);
        emailResult = {
          status: 'EMAIL_FAILED',
          message: mailErr.message
        };
      }
    }

    // 2. Delete Google Calendar event if one existed
    let calendarDeleted = false;
    if (previousEventId) {
      try {
        await deleteCalendarEvent(previousEventId);
        calendarDeleted = true;
      } catch (calErr) {
        console.error('Calendar deletion error:', calErr.message);
      }
    }

    res.status(200).json({
      message: 'Appointment cancelled successfully',
      appointment,
      email: emailResult,
      calendar: {
        deleted: calendarDeleted,
        previousEventId
      }
    });
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
    const appointment = await Appointment.findById(req.params.id)
      .populate('patient', 'name email')
      .populate({ path: 'doctor', populate: { path: 'user', select: 'name email' } });

    if (!appointment) {
      return res.status(404).json({ message: 'Appointment not found' });
    }

    if (appointment.status !== 'Scheduled') {
      return res.status(400).json({ message: 'Only scheduled appointments can be rescheduled' });
    }

    const startOfDay = new Date(date);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(date);
    endOfDay.setHours(23, 59, 59, 999);

    // Check conflict
    const conflict = await Appointment.findOne({
      doctor: appointment.doctor._id || appointment.doctor,
      date: { $gte: startOfDay, $lte: endOfDay },
      timeSlot,
      _id: { $ne: appointment._id },
      $or: [
        { status: { $in: ['Scheduled', 'Completed'] } },
        { status: 'Held', holdExpiresAt: { $gt: new Date() } }
      ]
    });

    if (conflict) {
      return res.status(409).json({ message: 'New time slot is already booked or held.' });
    }

    const oldDetails = {
      date: appointment.date.toISOString().split('T')[0],
      timeSlot: appointment.timeSlot
    };

    const previousEventId = appointment.googleCalendarEventId;
    appointment.date = new Date(date);
    appointment.timeSlot = timeSlot;
    await appointment.save();

    // 1. Send reschedule notification email to both patient & doctor
    const newDetails = {
      date: new Date(date).toISOString().split('T')[0],
      timeSlot: appointment.timeSlot,
      symptoms: appointment.symptoms
    };

    let emailResult = {
      status: 'EMAIL_NOT_CONFIGURED',
      message: 'No recipient email provided.'
    };

    if (appointment.patient?.email || appointment.doctor?.user?.email) {
      try {
        const mailRes = await sendRescheduleEmail(
          appointment.patient?.email,
          appointment.doctor?.user?.email,
          newDetails,
          oldDetails
        );
        emailResult = {
          status: mailRes?.status || 'EMAIL_SENT',
          message: mailRes?.status === 'EMAIL_SENT' ? 'Reschedule email sent' : mailRes?.message,
          messageId: mailRes?.messageId
        };
      } catch (mailErr) {
        console.error('[EMAIL_FAILED] Reschedule email:', mailErr.message);
        emailResult = {
          status: 'EMAIL_FAILED',
          message: mailErr.message
        };
      }
    }

    // 2. Google Calendar Update
    let calendarResult = { success: false, message: 'Calendar sync skipped' };
    if (previousEventId) {
      try {
        const updatedId = await updateCalendarEvent(
          previousEventId,
          appointment,
          appointment.patient,
          appointment.doctor?.user
        );
        if (updatedId) {
          calendarResult = {
            success: true,
            eventId: updatedId,
            message: 'Google Calendar event rescheduled successfully'
          };
        }
      } catch (calErr) {
        console.error('Calendar update error:', calErr.message);
      }
    }

    res.status(200).json({
      message: 'Appointment rescheduled successfully',
      appointment,
      email: emailResult,
      calendar: calendarResult
    });
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
      followUpSteps: aiPostVisit.followUpSteps || 'Follow up as needed.',
      isFallback: aiPostVisit.isFallback
    };

    await appointment.save();

    // Enqueue persistent background medication reminder job
    if (appointment.postVisitSummary?.medicationSchedule) {
      const populated = await Appointment.findById(appointment._id).populate('patient', 'name email');
      if (populated?.patient?.email) {
        await ReminderJob.findOneAndUpdate(
          { appointment: appointment._id },
          {
            appointment: appointment._id,
            patient: populated.patient._id,
            patientEmail: populated.patient.email,
            patientName: populated.patient.name,
            medicationSchedule: appointment.postVisitSummary.medicationSchedule,
            status: 'PENDING',
            attempts: 0,
            maxAttempts: 5,
            nextRunAt: new Date()
          },
          { upsert: true, new: true }
        ).catch(err => console.error('Failed to enqueue reminder job:', err.message));
      }
    }

    res.status(200).json(appointment);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Get user appointments (excludes incomplete holds)
// @route   GET /api/appointments/my
// @access  Private
const getMyAppointments = async (req, res) => {
  try {
    let query = {
      status: { $in: ['Scheduled', 'Completed', 'Cancelled'] }
    };

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
  holdSlot,
  bookAppointment,
  cancelAppointment,
  rescheduleAppointment,
  submitPostVisit,
  getMyAppointments
};
