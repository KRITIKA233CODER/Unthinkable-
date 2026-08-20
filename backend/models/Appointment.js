const mongoose = require('mongoose');

const appointmentSchema = new mongoose.Schema({
  patient: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  doctor: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'DoctorProfile',
    required: true,
  },
  date: {
    type: Date,
    required: true,
  },
  timeSlot: {
    type: String,
    required: true, // e.g., "10:00 AM"
  },
  status: {
    type: String,
    enum: ['Scheduled', 'Completed', 'Cancelled'],
    default: 'Scheduled',
  },
  symptoms: {
    type: String,
    required: true,
  },
  preVisitSummary: {
    urgencyLevel: { type: String, enum: ['Low', 'Medium', 'High'] },
    chiefComplaint: String,
    suggestedQuestions: [String],
  },
  postVisitSummary: {
    clinicalNotes: String,
    patientSummary: String,
    medicationSchedule: String,
    followUpSteps: String,
  },
  googleCalendarEventId: {
    type: String,
  }
}, { timestamps: true });

// Compound index to prevent double booking.
// The combination of doctor, date, and timeSlot must be unique.
appointmentSchema.index({ doctor: 1, date: 1, timeSlot: 1 }, { unique: true });

const Appointment = mongoose.model('Appointment', appointmentSchema);
module.exports = Appointment;
