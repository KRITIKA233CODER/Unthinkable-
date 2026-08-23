const nodemailer = require('nodemailer');

/**
 * Creates a Nodemailer transporter.
 * Uses real SMTP if EMAIL_USER and EMAIL_PASS are set.
 * Otherwise uses Ethereal test accounts for development/tests.
 */
const getTransporter = async () => {
  const user = process.env.EMAIL_USER;
  const pass = process.env.EMAIL_PASS;

  // Real SMTP (Production / Demo)
  if (user && pass && user !== 'your_email@gmail.com' && pass !== 'your_app_password') {
    return {
      transporter: nodemailer.createTransport({
        service: process.env.EMAIL_SERVICE || 'gmail',
        auth: { user, pass }
      }),
      type: 'SMTP'
    };
  }

  // Fallback to Ethereal Test Account in local dev / test
  try {
    const testAccount = await nodemailer.createTestAccount();
    return {
      transporter: nodemailer.createTransport({
        host: 'smtp.ethereal.email',
        port: 587,
        secure: false,
        auth: {
          user: testAccount.user,
          pass: testAccount.pass
        }
      }),
      type: 'ETHEREAL'
    };
  } catch (err) {
    console.warn('Could not initialize Ethereal test email:', err.message);
    return { transporter: null, type: 'NONE' };
  }
};

/**
 * Generic safe mail sender that returns standardized status codes:
 * EMAIL_SENT | EMAIL_FAILED | EMAIL_NOT_CONFIGURED
 */
const safeSendMail = async (mailOptions) => {
  const { transporter, type } = await getTransporter();

  if (!transporter) {
    console.warn(`[EMAIL_NOT_CONFIGURED] Skipping email to: ${mailOptions.to}`);
    return {
      status: 'EMAIL_NOT_CONFIGURED',
      message: 'SMTP credentials not configured in environment.'
    };
  }

  try {
    const info = await transporter.sendMail(mailOptions);
    const previewUrl = type === 'ETHEREAL' ? nodemailer.getTestMessageUrl(info) : undefined;
    console.log(`[EMAIL_SENT] MessageId: ${info.messageId} (Transporter: ${type})`);

    return {
      status: 'EMAIL_SENT',
      messageId: info.messageId,
      previewUrl,
      type
    };
  } catch (error) {
    console.error(`[EMAIL_FAILED] Destination: ${mailOptions.to} — Error: ${error.message}`);
    return {
      status: 'EMAIL_FAILED',
      message: error.message
    };
  }
};

// -------------------------------------------------------------
// 1. Booking Confirmation & Doctor Notification Flow
// -------------------------------------------------------------
const sendBookingConfirmation = async (patientEmail, doctorEmail, appointmentData) => {
  const recipients = [patientEmail, doctorEmail].filter(Boolean).join(', ');
  if (!recipients) {
    return { status: 'EMAIL_NOT_CONFIGURED', message: 'No recipient email addresses provided.' };
  }

  const mailOptions = {
    from: '"HealthPulse Clinic" <noreply@healthpulse.com>',
    to: recipients,
    subject: `Appointment Confirmed: ${appointmentData.date} at ${appointmentData.timeSlot}`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #1e293b;">
        <h2 style="color: #4f46e5;">HealthPulse AI Appointment Confirmation</h2>
        <p>Your healthcare appointment has been booked successfully.</p>
        <div style="background: #f8fafc; padding: 16px; border-radius: 8px; border: 1px solid #e2e8f0;">
          <p><strong>Date:</strong> ${appointmentData.date}</p>
          <p><strong>Time Slot:</strong> ${appointmentData.timeSlot}</p>
          <p><strong>Symptoms:</strong> ${appointmentData.symptoms || 'None specified'}</p>
          <p><strong>AI Urgency:</strong> <span style="font-weight: bold; color: ${appointmentData.urgencyLevel === 'High' ? '#dc2626' : '#2563eb'}">${appointmentData.urgencyLevel || 'Medium'}</span></p>
        </div>
        <p style="font-size: 0.85rem; color: #64748b; margin-top: 20px;">HealthPulse AI Clinic Management System</p>
      </div>
    `
  };

  return safeSendMail(mailOptions);
};

// -------------------------------------------------------------
// 2. Cancellation Flow (Patient or Doctor)
// -------------------------------------------------------------
const sendCancellationEmail = async (patientEmail, doctorEmail, appointmentData, reason = '') => {
  const recipients = [patientEmail, doctorEmail].filter(Boolean).join(', ');
  if (!recipients) {
    return { status: 'EMAIL_NOT_CONFIGURED', message: 'No recipient email addresses provided.' };
  }

  const mailOptions = {
    from: '"HealthPulse Clinic" <noreply@healthpulse.com>',
    to: recipients,
    subject: `Appointment Cancelled: ${appointmentData.date} at ${appointmentData.timeSlot}`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #1e293b;">
        <h2 style="color: #ef4444;">HealthPulse Appointment Cancelled</h2>
        <p>The following scheduled appointment has been cancelled:</p>
        <div style="background: #fef2f2; padding: 16px; border-radius: 8px; border: 1px solid #fecaca;">
          <p><strong>Date:</strong> ${appointmentData.date}</p>
          <p><strong>Time Slot:</strong> ${appointmentData.timeSlot}</p>
          ${reason ? `<p><strong>Reason:</strong> ${reason}</p>` : ''}
        </div>
        <p style="margin-top: 14px;">If you would like to re-book, please visit the HealthPulse portal.</p>
        <p style="font-size: 0.85rem; color: #64748b; margin-top: 20px;">HealthPulse AI Clinic Management System</p>
      </div>
    `
  };

  return safeSendMail(mailOptions);
};

// -------------------------------------------------------------
// 3. Doctor Leave Cancellation Flow
// -------------------------------------------------------------
const sendDoctorLeaveCancellation = async (patientEmail, doctorEmail, appointmentData, leaveReason = '') => {
  if (!patientEmail) {
    return { status: 'EMAIL_NOT_CONFIGURED', message: 'No patient email provided.' };
  }

  const mailOptions = {
    from: '"HealthPulse Clinic" <noreply@healthpulse.com>',
    to: patientEmail,
    subject: `Doctor On Leave — Appointment Notice (${appointmentData.date})`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #1e293b;">
        <h2 style="color: #d97706;">Appointment Notice: Doctor On Leave</h2>
        <p>Your doctor is on scheduled leave on <strong>${appointmentData.date}</strong> (${leaveReason || 'Leave'}).</p>
        <div style="background: #fffbeb; padding: 16px; border-radius: 8px; border: 1px solid #fde68a;">
          <p><strong>Affected Slot:</strong> ${appointmentData.timeSlot}</p>
          <p>Your appointment has been automatically cancelled to free up your schedule.</p>
        </div>
        <p style="margin-top: 14px;">Please log in to HealthPulse to choose an alternate date or specialist.</p>
        <p style="font-size: 0.85rem; color: #64748b; margin-top: 20px;">HealthPulse AI Clinic Management System</p>
      </div>
    `
  };

  return safeSendMail(mailOptions);
};

// -------------------------------------------------------------
// 4. Appointment Reschedule Flow
// -------------------------------------------------------------
const sendRescheduleEmail = async (patientEmail, doctorEmail, appointmentData, oldDetails) => {
  const recipients = [patientEmail, doctorEmail].filter(Boolean).join(', ');
  if (!recipients) {
    return { status: 'EMAIL_NOT_CONFIGURED', message: 'No recipient email addresses provided.' };
  }

  const mailOptions = {
    from: '"HealthPulse Clinic" <noreply@healthpulse.com>',
    to: recipients,
    subject: `Appointment Rescheduled: New Time ${appointmentData.date} at ${appointmentData.timeSlot}`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #1e293b;">
        <h2 style="color: #0284c7;">HealthPulse Appointment Rescheduled</h2>
        <p>Your appointment has been successfully updated with the following details:</p>
        <div style="background: #f0f9ff; padding: 16px; border-radius: 8px; border: 1px solid #bae6fd;">
          <p><strong>New Date & Time:</strong> ${appointmentData.date} at ${appointmentData.timeSlot}</p>
          <p style="color: #64748b; font-size: 0.88rem;"><strong>Previous Slot:</strong> ${oldDetails.date} at ${oldDetails.timeSlot}</p>
        </div>
        <p style="font-size: 0.85rem; color: #64748b; margin-top: 20px;">HealthPulse AI Clinic Management System</p>
      </div>
    `
  };

  return safeSendMail(mailOptions);
};

// -------------------------------------------------------------
// 5. Medication Reminder Flow (Background Job)
// -------------------------------------------------------------
const sendMedicationReminder = async (patientEmail, patientName, medicationInfo) => {
  if (!patientEmail) {
    return { status: 'EMAIL_NOT_CONFIGURED', message: 'No patient email provided.' };
  }

  const mailOptions = {
    from: '"HealthPulse Reminders" <reminders@healthpulse.com>',
    to: patientEmail,
    subject: `Medication Reminder for ${patientName}`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #1e293b;">
        <h3 style="color: #10b981;">Daily Medication Reminder</h3>
        <p>Dear ${patientName},</p>
        <p>This is your automated reminder for your prescribed medication regimen:</p>
        <div style="background: #ecfdf5; padding: 14px; border-radius: 8px; border: 1px solid #a7f3d0; font-family: monospace;">
          ${medicationInfo}
        </div>
        <p style="margin-top: 14px;">Stay healthy!</p>
        <p style="font-size: 0.85rem; color: #64748b; margin-top: 20px;">HealthPulse AI Clinic Management System</p>
      </div>
    `
  };

  return safeSendMail(mailOptions);
};

module.exports = {
  sendBookingConfirmation,
  sendCancellationEmail,
  sendDoctorLeaveCancellation,
  sendRescheduleEmail,
  sendMedicationReminder
};
