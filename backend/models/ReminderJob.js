const mongoose = require('mongoose');

const reminderJobSchema = new mongoose.Schema({
  appointment: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Appointment',
    required: true,
  },
  patient: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  patientEmail: {
    type: String,
    required: true,
  },
  patientName: {
    type: String,
    required: true,
  },
  medicationSchedule: {
    type: String,
    required: true,
  },
  status: {
    type: String,
    enum: ['PENDING', 'SENT', 'FAILED_PERMANENTLY'],
    default: 'PENDING',
  },
  attempts: {
    type: Number,
    default: 0,
  },
  maxAttempts: {
    type: Number,
    default: 5,
  },
  nextRunAt: {
    type: Date,
    default: Date.now,
  },
  lastAttemptAt: {
    type: Date,
  },
  lastError: {
    type: String,
  },
}, { timestamps: true });

// Efficient querying index for due jobs
reminderJobSchema.index({ status: 1, nextRunAt: 1 });

// Prevent duplicate reminder jobs for the same appointment
reminderJobSchema.index({ appointment: 1 }, { unique: true });

const ReminderJob = mongoose.model('ReminderJob', reminderJobSchema);
module.exports = ReminderJob;
