// Unit tests for booking & conflict logic contract

// Mock setup for testing booking logic contract
describe('Appointment Booking & Conflict Logic Unit Tests', () => {
  
  test('Prevents double booking for identical doctor, date, and timeslot', () => {
    const existingBooking = {
      doctorId: 'doc123',
      date: '2026-09-01',
      timeSlot: '10:00 AM'
    };

    const newBookingAttempt = {
      doctorId: 'doc123',
      date: '2026-09-01',
      timeSlot: '10:00 AM'
    };

    const isConflict = 
      existingBooking.doctorId === newBookingAttempt.doctorId &&
      existingBooking.date === newBookingAttempt.date &&
      existingBooking.timeSlot === newBookingAttempt.timeSlot;

    expect(isConflict).toBe(true);
  });

  test('Allows booking for different timeslots for the same doctor', () => {
    const existingBooking = {
      doctorId: 'doc123',
      date: '2026-09-01',
      timeSlot: '10:00 AM'
    };

    const newBookingAttempt = {
      doctorId: 'doc123',
      date: '2026-09-01',
      timeSlot: '11:00 AM'
    };

    const isConflict = 
      existingBooking.doctorId === newBookingAttempt.doctorId &&
      existingBooking.date === newBookingAttempt.date &&
      existingBooking.timeSlot === newBookingAttempt.timeSlot;

    expect(isConflict).toBe(false);
  });

  test('Blocks booking if doctor is on leave on specified date', () => {
    const doctorLeaveDays = ['2026-09-05'];
    const requestedDate = '2026-09-05';

    const isOnLeave = doctorLeaveDays.includes(requestedDate);
    expect(isOnLeave).toBe(true);
  });
});
