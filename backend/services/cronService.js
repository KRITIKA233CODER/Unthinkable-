const cron = require('node-cron');
const Appointment = require('../models/Appointment');
const ReminderJob = require('../models/ReminderJob');
const { sendMedicationReminder } = require('./emailService');

/**
 * Core Reminder Processor:
 * 1. Syncs any new completed appointments into the persistent ReminderJob collection.
 * 2. Fetches pending reminder jobs due for execution.
 * 3. Applies bounded exponential backoff on failure and marks permanent failure when max attempts reached.
 */
const processReminderJobs = async () => {
  try {
    // 1. Sync completed appointments with medication schedules into persistent ReminderJob queue
    const completedAppointments = await Appointment.find({
      status: 'Completed',
      'postVisitSummary.medicationSchedule': { $exists: true, $ne: '' }
    }).populate('patient', 'name email');

    for (const appt of completedAppointments) {
      if (appt.patient && appt.patient.email) {
        // Upsert job so it's created once and never duplicated
        const existingJob = await ReminderJob.findOne({ appointment: appt._id });
        if (!existingJob) {
          await ReminderJob.create({
            appointment: appt._id,
            patient: appt.patient._id,
            patientEmail: appt.patient.email,
            patientName: appt.patient.name,
            medicationSchedule: appt.postVisitSummary.medicationSchedule,
            status: 'PENDING',
            attempts: 0,
            maxAttempts: 5,
            nextRunAt: new Date()
          });
          console.log(`[REMINDER_QUEUED] Created reminder job for appointment ${appt._id}`);
        }
      }
    }

    // 2. Fetch all PENDING jobs that are due for execution (nextRunAt <= now)
    const now = new Date();
    const dueJobs = await ReminderJob.find({
      status: 'PENDING',
      nextRunAt: { $lte: now }
    });

    if (dueJobs.length > 0) {
      console.log(`[REMINDER_WORKER] Processing ${dueJobs.length} due reminder job(s)...`);
    }

    for (const job of dueJobs) {
      job.attempts += 1;
      job.lastAttemptAt = new Date();

      try {
        const result = await sendMedicationReminder(
          job.patientEmail,
          job.patientName,
          job.medicationSchedule
        );

        if (result && result.status === 'EMAIL_SENT') {
          job.status = 'SENT';
          job.lastError = undefined;
          console.log(`[REMINDER_DELIVERED] Job ${job._id} successfully sent to ${job.patientEmail} (Attempt ${job.attempts}/${job.maxAttempts})`);
        } else {
          // Delivery failed or not configured
          job.lastError = result?.message || 'Email delivery failed';
          
          if (job.attempts >= job.maxAttempts) {
            job.status = 'FAILED_PERMANENTLY';
            console.warn(`[REMINDER_PERMANENT_FAILURE] Job ${job._id} permanently failed after ${job.attempts} attempts. Error: ${job.lastError}`);
          } else {
            // Exponential backoff: Attempt 1 -> 2m, Attempt 2 -> 4m, Attempt 3 -> 8m, Attempt 4 -> 16m (max capped at 60m)
            const backoffMinutes = Math.min(60, Math.pow(2, job.attempts));
            job.nextRunAt = new Date(Date.now() + backoffMinutes * 60 * 1000);
            console.log(`[REMINDER_RETRY_SCHEDULED] Job ${job._id} attempt ${job.attempts}/${job.maxAttempts} failed. Retrying at ${job.nextRunAt.toISOString()}`);
          }
        }
      } catch (sendErr) {
        job.lastError = sendErr.message;
        if (job.attempts >= job.maxAttempts) {
          job.status = 'FAILED_PERMANENTLY';
          console.warn(`[REMINDER_PERMANENT_FAILURE] Job ${job._id} permanently failed after ${job.attempts} attempts. Error: ${sendErr.message}`);
        } else {
          const backoffMinutes = Math.min(60, Math.pow(2, job.attempts));
          job.nextRunAt = new Date(Date.now() + backoffMinutes * 60 * 1000);
          console.log(`[REMINDER_RETRY_SCHEDULED] Job ${job._id} attempt ${job.attempts}/${job.maxAttempts} error. Retrying at ${job.nextRunAt.toISOString()}`);
        }
      }

      await job.save();
    }
  } catch (error) {
    console.error('[REMINDER_WORKER_ERROR]', error.message);
  }
};

/**
 * Initializes background cron jobs for medication reminders and notification retries.
 */
const initCronJobs = () => {
  // Run on startup
  processReminderJobs();

  // Run periodically (every minute for timely retry handling)
  cron.schedule('* * * * *', async () => {
    await processReminderJobs();
  });

  console.log('Background cron jobs with persistent retry queue initialized successfully.');
};

module.exports = {
  initCronJobs,
  processReminderJobs
};
