# Healthcare System Design Write-Up

## 1. Overview & Architecture
The Healthcare Appointment & Follow-Up Manager is built using a decoupled MERN architecture (MongoDB, Express, React, Node.js) with Google Gemini AI integration. The system serves three distinct roles: Patients, Doctors, and Admins.

---

## 2. Double-Booking Prevention Mechanism
To guarantee that no two patients can ever book the same doctor at the same date and time slot, the system employs a multi-tiered concurrency control strategy:

### A. Database-Level Schema Constraint
A compound unique index is applied at the MongoDB schema layer:
```javascript
appointmentSchema.index({ doctor: 1, date: 1, timeSlot: 1 }, { unique: true });
```
This acts as an immutable database constraint, ensuring physical impossibility of duplicate slot entries.

### B. Controller-Level ACID Transactions
When a booking or hold request arrives, the Express controller initiates a MongoDB Session transaction (`mongoose.startSession()`). If two concurrent HTTP requests attempt to lock the same doctor slot at the exact same millisecond, MongoDB's write-lock rejects the second transaction with error code `11000`. The controller catches this error gracefully and responds to the client with an HTTP `409 Conflict` ("This slot is already booked or held").

---

## 3. Doctor Leave Conflict Handling
When a doctor marks a leave day (`POST /api/doctors/leave`):
1. The backend appends the date to the `leaveDays` array in `DoctorProfile`.
2. Cache invalidation (`cache.flushAll()`) ensures no stale availability is served.
3. The system queries all existing appointments scheduled for that doctor on the affected date.
4. Each conflicting appointment is transitioned to `Cancelled`.
5. Google Calendar events are cleaned up via `deleteCalendarEvent(eventId)`.
6. Automated cancellation notice emails (`sendDoctorLeaveCancellation`) are sent to affected patients.

---

## 4. Atomic 5-Minute Slot Hold Mechanism
To prevent race conditions while patients type or speak symptoms:
- When a patient selects an available slot, `POST /api/appointments/hold` executes inside an atomic session.
- A hold document is created with `status: 'Held'` and `holdExpiresAt: Date.now() + 5 minutes`.
- MongoDB TTL index (`appointmentSchema.index({ holdExpiresAt: 1 }, { expireAfterSeconds: 0 })`) ensures automatic cleanup of expired holds.
- Other patients attempting to select the held slot receive `HTTP 409 Conflict`.
- When the holding patient confirms booking (`POST /api/appointments/book`), the hold transitions to `status: 'Scheduled'` and `holdExpiresAt` is cleared.

---

## 5. Background Medication Reminders & Persistent Retry Queue

### A. Design Rationale
Rather than introducing heavy external message broker dependencies (e.g. Redis/BullMQ), which would require complex devops infrastructure for a lightweight clinic system, the application uses a **MongoDB-Backed Persistent Job Queue** driven by `node-cron`.

### B. Data Model (`ReminderJob`)
```javascript
{
  appointment: ObjectId (ref: 'Appointment', unique),
  patient: ObjectId (ref: 'User'),
  patientEmail: String,
  patientName: String,
  medicationSchedule: String,
  status: 'PENDING' | 'SENT' | 'FAILED_PERMANENTLY',
  attempts: Number,
  maxAttempts: 5,
  nextRunAt: Date,
  lastAttemptAt: Date,
  lastError: String
}
```

### C. State Machine & Execution Flow
1. **Job Enqueueing:** When a doctor submits post-visit notes containing a medication schedule (`POST /api/appointments/:id/post-visit`), a `ReminderJob` document is created/upserted in MongoDB with `status: 'PENDING'`.
2. **Background Cron Worker:** `node-cron` periodically queries:
   ```javascript
   ReminderJob.find({ status: 'PENDING', nextRunAt: { $lte: new Date() } })
   ```
3. **Delivery Attempt:** For each due job, `attempts` is incremented and `sendMedicationReminder()` is called via Nodemailer.
4. **Success State:** If email delivery succeeds (`EMAIL_SENT`), the job is marked `status: 'SENT'`. It is never re-executed, preventing duplicate reminders.
5. **Bounded Exponential Backoff:**
   If sending fails (e.g. SMTP network error):
   $$\text{BackoffMinutes} = \min(60, 2^{\text{attempts}})$$
   - Attempt 1 failure $\rightarrow$ Retry in 2 minutes
   - Attempt 2 failure $\rightarrow$ Retry in 4 minutes
   - Attempt 3 failure $\rightarrow$ Retry in 8 minutes
   - Attempt 4 failure $\rightarrow$ Retry in 16 minutes
   - Attempt 5 failure $\rightarrow$ Transition to `status: 'FAILED_PERMANENTLY'`
6. **Crash & Restart Durability:**
   Because all job states, attempt counts, and `nextRunAt` timestamps reside in MongoDB, server restarts or crashes never lose pending retry jobs. On reboot, `initCronJobs()` immediately resumes processing pending jobs whose `nextRunAt` has elapsed.
