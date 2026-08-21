const cron = require('node-cron');
const Appointment = require('../models/Appointment');
const { sendMedicationReminder } = require('./emailService');

/**
 * Initializes background cron jobs for medication reminders and notification retries.
 */
const initCronJobs = () => {
  // Run every hour to check active appointments with medication schedules
  cron.schedule('0 * * * *', async () => {
    console.log('Running background medication reminder check...');

    try {
      // Fetch completed appointments that have medication schedules
      const completedAppointments = await Appointment.find({
        status: 'Completed',
        'postVisitSummary.medicationSchedule': { $exists: true, $ne: '' }
      }).populate('patient', 'name email');

      for (const appt of completedAppointments) {
        if (appt.patient && appt.patient.email) {
          await sendMedicationReminder(
            appt.patient.email,
            appt.patient.name,
            appt.postVisitSummary.medicationSchedule
          );
        }
      }
    } catch (error) {
      console.error('Error in background cron job:', error.message);
    }
  });

  console.log('Background cron jobs initialized successfully.');
};

module.exports = { initCronJobs };
