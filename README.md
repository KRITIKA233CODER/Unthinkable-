# 🩺 HealthPulse AI - Healthcare Appointment & Follow-Up Manager

A feature-complete Healthcare Appointment platform built with the **MERN Stack** (MongoDB, Express, React, Node.js) and **Google Gemini AI**. Designed for scalability, high performance, and zero double-booking concurrency safety.

---

## 🌟 Key Features

- 🔒 **Role-Based Authentication (RBAC):** JWT-secured authentication for Patients, Doctors, and Admins.
- ⚡ **Zero Double-Booking Guarantee:** Dual-layer concurrency protection using MongoDB transactions and compound unique indexes.
- 🤖 **AI Symptom Pre-Visit Assessment:** Converts raw symptoms into structured AI Urgency Levels (`Low` / `Medium` / `High`), chief complaints, and suggested doctor questions.
- 📝 **AI Post-Visit Patient Summary:** Translates doctor clinical notes into clear medication schedules and follow-up steps.
- 🛡️ **Graceful AI Degradation:** System remains 100% functional even if LLM APIs are unreachable or offline.
- 🚀 **Local Memory Caching:** `node-cache` implementation for lightning-fast doctor search and availability checks.
- 🎤 **Voice-to-Text Symptom Input:** Speech recognition API allowing patients to speak their symptoms directly.
- 📊 **Doctor Pulse Dashboard:** Color-coded patient queue based on AI urgency scores.
- ⏰ **Background Cron Reminders:** Automated hourly medication reminder checks via `node-cron`.
- 📅 **Google Calendar Sync:** OAuth 2.0 integration for automatic event creation, update, and deletion.
- 📧 **Email Notifications:** Booking confirmation, cancellation, and medication reminders via Nodemailer.
- 🛠️ **Admin Panel:** Full CRUD management of doctor profiles (specialization, working hours, slot duration, leave days).

---

## 🗄️ Database Schema Design

### User Schema
| Field | Type | Details |
|:---|:---|:---|
| `name` | String | Required |
| `email` | String | Required, Unique |
| `password` | String | Hashed with bcrypt |
| `role` | Enum | `patient` / `doctor` / `admin` |

### DoctorProfile Schema
| Field | Type | Details |
|:---|:---|:---|
| `user` | ObjectId → User | Required |
| `specialization` | String | e.g., "Cardiology" |
| `workingHours` | Object | `{ start: "09:00", end: "17:00" }` |
| `slotDuration` | Number | Default: 30 (minutes) |
| `leaveDays` | Array | `[{ date, reason }]` |

### Appointment Schema
| Field | Type | Details |
|:---|:---|:---|
| `patient` | ObjectId → User | Required |
| `doctor` | ObjectId → DoctorProfile | Required |
| `date` | Date | Required |
| `timeSlot` | String | e.g., "10:00 AM" |
| `status` | Enum | `Scheduled` / `Completed` / `Cancelled` |
| `symptoms` | String | Raw patient input |
| `preVisitSummary` | Object | `{ urgencyLevel, chiefComplaint, suggestedQuestions }` |
| `postVisitSummary` | Object | `{ clinicalNotes, patientSummary, medicationSchedule, followUpSteps }` |
| `googleCalendarEventId` | String | Google Calendar event ID |

> **Compound Unique Index:** `{ doctor: 1, date: 1, timeSlot: 1 }` — prevents double booking at DB level.

---

## 📡 API Endpoints

### Authentication
| Method | Endpoint | Access | Description |
|:---|:---|:---:|:---|
| `POST` | `/api/auth/register` | Public | Register (patient/doctor/admin) |
| `POST` | `/api/auth/login` | Public | Login & receive JWT |
| `GET` | `/api/auth/me` | Private | Get current user profile |

### Doctor Profiles (Admin CRUD + Search)
| Method | Endpoint | Access | Description |
|:---|:---|:---:|:---|
| `GET` | `/api/doctors?specialization=X` | Public | Search doctors by specialization |
| `POST` | `/api/doctors` | Admin | Create doctor profile |
| `PUT` | `/api/doctors/:id` | Admin | Update doctor profile |
| `DELETE` | `/api/doctors/:id` | Admin | Delete doctor profile |
| `POST` | `/api/doctors/leave` | Doctor | Mark leave & notify affected patients |

### Appointments
| Method | Endpoint | Access | Description |
|:---|:---|:---:|:---|
| `POST` | `/api/appointments/book` | Patient | Book + AI pre-visit summary + email + calendar |
| `PUT` | `/api/appointments/:id/cancel` | Patient/Doctor | Cancel + email + delete calendar event |
| `PUT` | `/api/appointments/:id/reschedule` | Patient | Reschedule to new slot |
| `POST` | `/api/appointments/:id/post-visit` | Doctor | Submit notes + AI post-visit summary |
| `GET` | `/api/appointments/my` | Private | Get current user's appointments |

---

## 📅 Google Calendar API OAuth 2.0 Setup

1. Go to the [Google Cloud Console](https://console.cloud.google.com/).
2. Create a new project named `HealthPulse AI`.
3. Navigate to **APIs & Services → Library** and enable the **Google Calendar API**.
4. Go to **APIs & Services → Credentials → Create Credentials → OAuth Client ID**.
5. Select **Web Application**, set authorized redirect URI to `http://localhost:5000/api/auth/google/callback`.
6. Copy `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` into `backend/.env`.
7. Use the [OAuth 2.0 Playground](https://developers.google.com/oauthplayground/) to generate a `GOOGLE_REFRESH_TOKEN` with the `https://www.googleapis.com/auth/calendar` scope.
8. Add the refresh token to `backend/.env`.

---

## 🚀 Quick Setup

### Prerequisites
- Node.js (v18+)
- MongoDB (local or Atlas)

### Backend
```bash
cd backend
npm install
cp .env.example .env    # Fill in your keys
npm run seed            # Populate sample data
npm start               # http://localhost:5000
```

### Frontend
```bash
cd frontend
npm install
npm run dev             # http://localhost:5173
```

---

## 🧪 Running Unit Tests

```bash
cd backend
npm test
```

Covers: double-booking prevention, leave conflicts, AI fallback mechanisms, email service.

---

## 📄 System Design Write-Up

See [`SYSTEM_DESIGN.md`](./SYSTEM_DESIGN.md) — 800-word document covering:
- Double-booking prevention mechanism
- Doctor leave conflict handling
- Slot hold mechanism
- Notification failure handling

---

## 🤖 LLM Prompts Used

### Pre-Visit:
```
Analyse these symptoms and return: urgency level (Low / Medium / High),
chief complaint, and three suggested questions for the doctor.
Symptoms: <symptoms>
```

### Post-Visit:
```
Convert these clinical notes into a patient-friendly summary with
medication schedule and follow-up steps: <notes>
```
