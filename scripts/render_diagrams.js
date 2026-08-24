const fs = require('fs');
const path = require('path');

const outDir = path.join(__dirname, '..', 'docs', 'diagrams');
if (!fs.existsSync(outDir)) {
  fs.mkdirSync(outDir, { recursive: true });
}

const diagrams = [
  {
    name: 'workflow_diagram',
    code: `flowchart TD
    subgraph Patient Journey
        A[Select Specialization & Doctor] --> B[Pick Date & Available Slot]
        B --> C[Atomic 5-Min Slot Hold Lock]
        C --> D[Describe Symptoms / Voice Input]
        D --> E[Confirm Booking]
        E --> F[Gemini Pre-Visit Triage Extraction]
        F --> G[Scheduled Appointment Stored]
    end

    subgraph Doctor Journey
        G --> H[Doctor Reviews Queue & Urgency Score]
        H --> I[Conduct Consultation & Record Notes]
        I --> J[Submit Clinical Diagnosis & Rx]
        J --> K[Gemini Post-Visit Translation]
    end

    subgraph Follow-Up & Notifications
        K --> L[Structured Care Plan & Rx Stored]
        L --> M[Patient Views Care Plan in Portal]
        L --> N[Background Reminder Queue]
        N --> O[Nodemailer Medication Reminders]
        E --> P[Google Calendar & Confirmation Email]
    end`
  },
  {
    name: 'system_architecture',
    code: `graph TD
    Client[React 19 SPA] -->|REST API & Bearer JWT| AuthMiddleware[Express Auth & RBAC Middleware]
    AuthMiddleware --> Controllers[Express Controllers]
    
    Controllers --> Mongoose[Mongoose Models]
    Mongoose --> MongoDB[(MongoDB Database)]
    
    Controllers --> AIService[Gemini AI Service]
    AIService -.->|External API| GoogleGemini[Google Gemini 1.5 Flash]
    
    Controllers --> EmailService[Nodemailer Email Service]
    EmailService -.->|SMTP / Ethereal| MailServer[Mail Transport]
    
    Controllers --> CalService[Google Calendar Service]
    CalService -.->|OAuth 2.0| GoogleCal[Google Calendar API]
    
    Cron[Node-Cron Worker] --> ReminderJobModel[ReminderJob Queue]
    ReminderJobModel --> EmailService`
  },
  {
    name: 'double_booking_prevention',
    code: `sequenceDiagram
    autonumber
    actor PatientA as Patient A
    actor PatientB as Patient B
    participant Server as Express Server
    participant Session as Mongo Transaction Session
    participant DB as MongoDB (Unique Index)

    PatientA->>Server: POST /api/appointments/book (10:00 AM)
    PatientB->>Server: POST /api/appointments/book (10:00 AM)
    Server->>Session: startSession() & withTransaction()
    Session->>DB: Write Lock on { doctor, date, 10:00 AM }
    DB-->>PatientA: 200 OK (Appointment Created)
    DB-->>PatientB: 409 Conflict (E11000 Duplicate Key Collided)`
  }
];

async function generateDiagrams() {
  for (const d of diagrams) {
    const payload = {
      code: d.code,
      mermaid: {
        theme: 'default'
      }
    };
    const b64 = Buffer.from(JSON.stringify(payload)).toString('base64');
    const urlPng = `https://mermaid.ink/img/${b64}?bgColor=FFFFFF`;
    const urlSvg = `https://mermaid.ink/svg/${b64}`;

    console.log(`Fetching ${d.name}...`);
    try {
      // Fetch PNG
      const resPng = await fetch(urlPng);
      if (resPng.ok) {
        const buffer = Buffer.from(await resPng.arrayBuffer());
        const filePath = path.join(outDir, `${d.name}.png`);
        fs.writeFileSync(filePath, buffer);
        console.log(`Saved: ${filePath} (${buffer.length} bytes)`);
      } else {
        console.warn(`PNG fetch failed for ${d.name}: ${resPng.statusText}`);
      }

      // Fetch SVG
      const resSvg = await fetch(urlSvg);
      if (resSvg.ok) {
        const svgText = await resSvg.text();
        const filePathSvg = path.join(outDir, `${d.name}.svg`);
        fs.writeFileSync(filePathSvg, svgText);
        console.log(`Saved: ${filePathSvg} (${svgText.length} bytes)`);
      }
    } catch (err) {
      console.error(`Error generating ${d.name}:`, err.message);
    }
  }
}

generateDiagrams();
