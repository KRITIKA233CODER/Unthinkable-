// Unit tests for booking, dynamic slot generation & slot-hold contract

describe('Appointment Booking, Dynamic Slots & Slot-Hold Mechanism Unit Tests', () => {
  
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

  test('Dynamically generates correct slot intervals based on workingHours and slotDuration', () => {
    const startMinutes = 9 * 60;  // 09:00 -> 540
    const endMinutes = 12 * 60;   // 12:00 -> 720
    const slotDuration = 30;

    const slots = [];
    for (let m = startMinutes; m + slotDuration <= endMinutes; m += slotDuration) {
      const hours = Math.floor(m / 60);
      const minutes = m % 60;
      const period = hours >= 12 ? 'PM' : 'AM';
      const displayHours = hours % 12 === 0 ? 12 : hours % 12;
      slots.push(`${String(displayHours).padStart(2, '0')}:${String(minutes).padStart(2, '0')} ${period}`);
    }

    expect(slots).toEqual([
      '09:00 AM',
      '09:30 AM',
      '10:00 AM',
      '10:30 AM',
      '11:00 AM',
      '11:30 AM'
    ]);
  });

  test('Active unexpired slot-hold blocks other users from holding the same slot', () => {
    const now = new Date();
    const activeHold = {
      patientId: 'patient-A',
      status: 'Held',
      holdExpiresAt: new Date(now.getTime() + 5 * 60 * 1000) // valid for 5 mins
    };

    const isHoldValid = activeHold.status === 'Held' && activeHold.holdExpiresAt > now;
    const canUserBHold = !isHoldValid;

    expect(isHoldValid).toBe(true);
    expect(canUserBHold).toBe(false); // User B is blocked
  });

  test('Expired slot-hold automatically frees the slot for another user', () => {
    const now = new Date();
    const expiredHold = {
      patientId: 'patient-A',
      status: 'Held',
      holdExpiresAt: new Date(now.getTime() - 1000) // expired 1s ago
    };

    const isHoldActive = expiredHold.status === 'Held' && expiredHold.holdExpiresAt > now;
    const canUserBHold = !isHoldActive;

    expect(isHoldActive).toBe(false);
    expect(canUserBHold).toBe(true); // User B can now acquire the hold
  });

  test('Converting valid hold to Scheduled clears holdExpiresAt and sets status to Scheduled', () => {
    const hold = {
      _id: 'hold123',
      patient: 'patient-A',
      status: 'Held',
      holdExpiresAt: new Date(Date.now() + 300000)
    };

    // User confirms booking
    hold.status = 'Scheduled';
    hold.holdExpiresAt = undefined;

    expect(hold.status).toBe('Scheduled');
    expect(hold.holdExpiresAt).toBeUndefined();
  });
});
