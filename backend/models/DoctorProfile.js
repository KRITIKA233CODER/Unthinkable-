const mongoose = require('mongoose');

const doctorProfileSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  specialization: {
    type: String,
    required: true,
  },
  workingHours: {
    start: { type: String, required: true }, // e.g., '09:00'
    end: { type: String, required: true },   // e.g., '17:00'
  },
  slotDuration: {
    type: Number, // in minutes
    default: 30,
  },
  leaveDays: [{
    date: { type: Date, required: true },
    reason: { type: String },
  }],
}, { timestamps: true });

const DoctorProfile = mongoose.model('DoctorProfile', doctorProfileSchema);
module.exports = DoctorProfile;
