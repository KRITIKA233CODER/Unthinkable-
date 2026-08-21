const mongoose = require('mongoose');
const dotenv = require('dotenv');
const User = require('./models/User');
const DoctorProfile = require('./models/DoctorProfile');
const Appointment = require('./models/Appointment');

dotenv.config();

const seedData = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/healthcare_manager');
    console.log('Connected to MongoDB for seeding...');

    // Clear existing data
    await User.deleteMany({});
    await DoctorProfile.deleteMany({});
    await Appointment.deleteMany({});

    // Create Admin
    const admin = await User.create({
      name: 'Clinic Admin',
      email: 'admin@clinic.com',
      password: 'password123',
      role: 'admin'
    });

    // Create Doctors
    const docUser1 = await User.create({
      name: 'Dr. Sarah Jenkins',
      email: 'sarah.jenkins@clinic.com',
      password: 'password123',
      role: 'doctor'
    });

    const docProfile1 = await DoctorProfile.create({
      user: docUser1._id,
      specialization: 'Cardiology',
      workingHours: { start: '09:00', end: '17:00' },
      slotDuration: 30,
      leaveDays: [{ date: new Date('2026-09-15'), reason: 'Medical Conference' }]
    });

    const docUser2 = await User.create({
      name: 'Dr. Michael Chen',
      email: 'michael.chen@clinic.com',
      password: 'password123',
      role: 'doctor'
    });

    await DoctorProfile.create({
      user: docUser2._id,
      specialization: 'Neurology',
      workingHours: { start: '10:00', end: '16:00' },
      slotDuration: 30
    });

    // Create Patient
    const patient = await User.create({
      name: 'Alex Rivera',
      email: 'alex.rivera@example.com',
      password: 'password123',
      role: 'patient'
    });

    // Create Sample Appointment
    await Appointment.create({
      patient: patient._id,
      doctor: docProfile1._id,
      date: new Date('2026-09-10'),
      timeSlot: '10:00 AM',
      status: 'Scheduled',
      symptoms: 'Chest tightness and mild shortness of breath during exertion.',
      preVisitSummary: {
        urgencyLevel: 'High',
        chiefComplaint: 'Chest tightness during physical activity.',
        suggestedQuestions: [
          'What diagnostic cardiac tests are recommended?',
          'Should I refrain from exercise immediately?',
          'What emergency signs should I watch out for?'
        ]
      }
    });

    console.log('Database seeded successfully!');
    process.exit(0);
  } catch (error) {
    console.error('Seeding Error:', error.message);
    process.exit(1);
  }
};

seedData();
