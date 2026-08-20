# Healthcare System Design Write-Up

## 1. Overview & Architecture
The Healthcare Appointment & Follow-Up Manager is built using a decoupled MERN architecture (MongoDB, Express, React, Node.js) with Google Gemini AI integration. The system serves three roles: Patients, Doctors, and Admins.

---

## 2. Double-Booking Prevention Mechanism
To guarantee that no two patients can ever book the same doctor at the same date and time slot, the system employs a two-tier concurrency control strategy:

### A. Database-Level Schema Constraint
A compound unique index is applied at the MongoDB schema layer:
`AppointmentSchema.index({ doctor: 1, date: 1, timeSlot: 1 }, { unique: true })`
This acts as an immutable database constraint, ensuring physical impossibility of duplicate slot entries.

### B. Controller-Level ACID Transactions
When a booking request arrives, the Express controller initiates a MongoDB Session transaction (`mongoose.startSession()`). If two concurrent HTTP requests attempt to lock the same doctor slot at the exact same millisecond, MongoDB's write-lock rejects the second transaction with error code `11000`. The controller catches this error gracefully and responds to the client with an HTTP `409 Conflict` ("This slot has already been reserved").

---

## 3. Doctor Leave Conflict Handling
When a doctor marks a leave day:
1. The backend appends the date to the `leaveDays` array in `DoctorProfile`.
2. Immediate cache invalidation (`cache.del('all_doctors')`) ensures no new appointments can be attempted on that date.
3. The system queries all existing appointments scheduled for that doctor on the affected date.
4. Notifications (email) are triggered to affected patients automatically.
5. High-urgency appointments (evaluated via AI pre-visit summary) are flagged for priority rescheduling suggestions.

---

## 4. Temporary Slot Hold Mechanism
To prevent "cart-hoarding" during checkout:
- When a patient selects a time slot, a temporary hold key is created in `node-cache` with a 5-minute Time-To-Live (TTL): `slot_hold:{doctorId}:{date}:{timeSlot}`.
- If another patient attempts to click the same slot while held, the backend returns a `423 Locked` status.
- If the patient completes the symptom submission within 5 minutes, the appointment is finalized and the hold key is released. If the timer expires, `node-cache` automatically purges the key, returning the slot to the public pool.

---

## 5. Notification Reliability & Graceful Failure Handling
Email notifications (Nodemailer/SMTP) and AI summarizations are integrated as resilient, non-blocking operations:

### A. Asynchronous Processing
Email sending and Google Calendar sync run asynchronously after DB commit, ensuring API response times remain under 100ms.

### B. LLM Fallback Mechanism
If the Google Gemini API fails (network timeout or missing API key), the system switches to a local template fallback generator. The user booking succeeds without error, ensuring 100% uptime.

### C. Background Retry Cron
Failed email dispatches are queued and retried by a background `node-cron` worker every hour.
