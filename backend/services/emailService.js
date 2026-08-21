const nodemailer = require('nodemailer');

// Create test transporter or use production SMTP credentials from .env
const createTransporter = async () => {
  if (process.env.EMAIL_USER && process.env.EMAIL_PASS) {
    return nodemailer.createTransport({
      service: process.env.EMAIL_SERVICE || 'gmail',
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
      },
    });
  }

  // Fallback to auto-generated Ethereal test account for local testing
  const testAccount = await nodemailer.createTestAccount();
  return nodemailer.createTransport({
    host: 'smtp.ethereal.email',
    port: 587,
    secure: false,
    auth: {
      user: testAccount.user,
      pass: testAccount.pass,
    },
  });
};

/**
 * Sends booking confirmation email to patient and doctor.
 */
const sendBookingConfirmation = async (patientEmail, doctorEmail, appointmentData) => {
  try {
    const transporter = await createTransporter();

    const mailOptions = {
      from: '"Healthcare Manager" <noreply@healthcare.com>',
      to: [patientEmail, doctorEmail].join(', '),
      subject: `Appointment Confirmed - ${appointmentData.date} at ${appointmentData.timeSlot}`,
      html: `
        <h2>Healthcare Appointment Confirmation</h2>
        <p>Your appointment has been successfully scheduled!</p>
        <ul>
          <li><strong>Date:</strong> ${appointmentData.date}</li>
          <li><strong>Time Slot:</strong> ${appointmentData.timeSlot}</li>
          <li><strong>Symptoms Reported:</strong> ${appointmentData.symptoms}</li>
          <li><strong>Urgency Level:</strong> ${appointmentData.urgencyLevel || 'Medium'}</li>
        </ul>
        <p>Thank you for choosing our healthcare clinic.</p>
      `,
    };

    const info = await transporter.sendMail(mailOptions);
    console.log('Confirmation email sent: %s', info.messageId);
    return info;
  } catch (error) {
    console.error('Failed to send confirmation email:', error.message);
    // Graceful handling - email failure does not crash the system
  }
};

/**
 * Sends medication reminder email.
 */
const sendMedicationReminder = async (patientEmail, patientName, medicationInfo) => {
  try {
    const transporter = await createTransporter();

    const mailOptions = {
      from: '"Healthcare Reminders" <reminders@healthcare.com>',
      to: patientEmail,
      subject: `Medication Reminder - ${patientName}`,
      html: `
        <h3>Medication Reminder</h3>
        <p>Dear ${patientName},</p>
        <p>This is a automated reminder for your prescribed medication:</p>
        <p><em>${medicationInfo}</em></p>
        <p>Stay healthy!</p>
      `,
    };

    const info = await transporter.sendMail(mailOptions);
    console.log('Medication reminder email sent: %s', info.messageId);
    return info;
  } catch (error) {
    console.error('Failed to send medication reminder email:', error.message);
  }
};

module.exports = {
  sendBookingConfirmation,
  sendMedicationReminder,
};
