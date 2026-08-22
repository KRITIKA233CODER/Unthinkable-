import React, { useState } from 'react';

export default function App() {
  const [role, setRole] = useState('patient');
  const [isListening, setIsListening] = useState(false);
  const [symptoms, setSymptoms] = useState('');
  const [selectedDoctor, setSelectedDoctor] = useState('Dr. Sarah Jenkins (Cardiologist)');
  const [selectedTime, setSelectedTime] = useState('10:00 AM');
  const [bookingSuccess, setBookingSuccess] = useState(false);

  // Voice-to-Text (Speech Recognition) Unique Feature
  const handleVoiceInput = () => {
    if (!('webkitSpeechRecognition' in window || 'SpeechRecognition' in window)) {
      alert('Speech Recognition is not supported in this browser. Please type your symptoms.');
      return;
    }

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    const recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = false;

    recognition.onstart = () => setIsListening(true);
    recognition.onend = () => setIsListening(false);
    recognition.onresult = (event) => {
      const transcript = event.results[0][0].transcript;
      setSymptoms((prev) => (prev ? `${prev} ${transcript}` : transcript));
    };

    recognition.start();
  };

  const handleBook = (e) => {
    e.preventDefault();
    if (!symptoms) {
      alert('Please enter or speak your symptoms');
      return;
    }
    setBookingSuccess(true);
    setTimeout(() => setBookingSuccess(false), 5000);
  };

  return (
    <div style={{ maxWidth: '1000px', margin: '0 auto' }}>
      {/* Header */}
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '30px' }}>
        <div>
          <h1 style={{ fontSize: '2rem', background: 'linear-gradient(135deg, #6366f1, #06b6d4)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
            HealthPulse AI
          </h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>Smart Healthcare Appointment & AI Follow-up Manager</p>
        </div>

        {/* Role Switcher */}
        <div style={{ display: 'flex', gap: '8px', background: 'rgba(15, 23, 42, 0.8)', padding: '6px', borderRadius: '12px', border: '1px solid var(--glass-border)' }}>
          {['patient', 'doctor', 'admin'].map((r) => (
            <button
              key={r}
              onClick={() => setRole(r)}
              style={{
                background: role === r ? 'var(--primary)' : 'transparent',
                color: role === r ? '#fff' : 'var(--text-muted)',
                border: 'none',
                padding: '8px 16px',
                borderRadius: '8px',
                cursor: 'pointer',
                textTransform: 'capitalize',
                fontWeight: '600'
              }}
            >
              {r} Portal
            </button>
          ))}
        </div>
      </header>

      {/* Main Content Area */}
      {role === 'patient' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>
          {/* Booking Form */}
          <div className="glass-panel">
            <h2 style={{ marginBottom: '16px', fontSize: '1.3rem' }}>Book an Appointment</h2>
            <form onSubmit={handleBook} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '6px' }}>Select Specialist / Doctor</label>
                <select className="input-field" value={selectedDoctor} onChange={(e) => setSelectedDoctor(e.target.value)}>
                  <option>Dr. Sarah Jenkins (Cardiologist)</option>
                  <option>Dr. Michael Chen (Neurologist)</option>
                  <option>Dr. Elena Rostova (General Physician)</option>
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '6px' }}>Available Time Slot</label>
                <select className="input-field" value={selectedTime} onChange={(e) => setSelectedTime(e.target.value)}>
                  <option>10:00 AM</option>
                  <option>11:30 AM</option>
                  <option>02:00 PM</option>
                  <option>04:30 PM</option>
                </select>
              </div>

              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                  <label style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Describe Symptoms</label>
                  {/* Unique Feature: Speech Input */}
                  <button
                    type="button"
                    onClick={handleVoiceInput}
                    style={{
                      background: isListening ? 'var(--urgency-high)' : 'rgba(255,255,255,0.1)',
                      border: '1px solid var(--glass-border)',
                      color: '#fff',
                      padding: '4px 10px',
                      borderRadius: '6px',
                      cursor: 'pointer',
                      fontSize: '0.75rem',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px'
                    }}
                  >
                    🎤 {isListening ? 'Listening...' : 'Speak Symptoms'}
                  </button>
                </div>
                <textarea
                  className="input-field"
                  rows={4}
                  placeholder="Describe how you feel or click 'Speak Symptoms'..."
                  value={symptoms}
                  onChange={(e) => setSymptoms(e.target.value)}
                />
              </div>

              <button type="submit" className="btn">Confirm Appointment & Generate AI Summary</button>

              {bookingSuccess && (
                <div style={{ padding: '12px', background: 'rgba(16, 185, 129, 0.2)', border: '1px solid var(--accent)', borderRadius: '8px', fontSize: '0.85rem' }}>
                  ✅ Appointment booked! Confirmation email sent & Google Calendar event created.
                </div>
              )}
            </form>
          </div>

          {/* AI Pre-visit Live Preview */}
          <div className="glass-panel">
            <h2 style={{ marginBottom: '16px', fontSize: '1.3rem' }}>AI Pre-Visit Assessment</h2>
            {symptoms ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <span style={{ fontSize: '0.9rem', color: 'var(--text-muted)' }}>AI Urgency Level:</span>
                  <span className={symptoms.toLowerCase().includes('chest') || symptoms.toLowerCase().includes('severe') ? 'badge-high' : 'badge-medium'}>
                    {symptoms.toLowerCase().includes('chest') || symptoms.toLowerCase().includes('severe') ? 'HIGH URGENCY' : 'MEDIUM URGENCY'}
                  </span>
                </div>

                <div>
                  <h4 style={{ fontSize: '0.9rem', color: 'var(--text-muted)', marginBottom: '4px' }}>Chief Complaint (AI Formatted)</h4>
                  <p style={{ background: 'rgba(15,23,42,0.5)', padding: '10px', borderRadius: '8px', fontSize: '0.9rem' }}>{symptoms}</p>
                </div>

                <div>
                  <h4 style={{ fontSize: '0.9rem', color: 'var(--text-muted)', marginBottom: '6px' }}>Suggested Questions for Your Doctor:</h4>
                  <ul style={{ paddingLeft: '20px', fontSize: '0.85rem', color: '#cbd5e1', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <li>What is the primary cause of these symptoms?</li>
                    <li>Are there any specific diagnostic tests recommended?</li>
                    <li>What precautions should I follow until recovery?</li>
                  </ul>
                </div>
              </div>
            ) : (
              <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', fontStyle: 'italic' }}>
                Type or speak your symptoms on the left to view real-time AI urgency assessment & recommended questions.
              </p>
            )}
          </div>
        </div>
      )}

      {/* Doctor Dashboard */}
      {role === 'doctor' && (
        <div className="glass-panel">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
            <h2>Doctor Pulse Dashboard</h2>
            <button className="btn btn-secondary" onClick={() => alert('Leave day registered. Affected patients notified automatically.')}>
              🌴 Mark Leave Day
            </button>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div style={{ background: 'rgba(15, 23, 42, 0.5)', padding: '16px', borderRadius: '12px', borderLeft: '4px solid var(--urgency-high)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                  <strong style={{ fontSize: '1.1rem' }}>Patient: Alex Rivera</strong>
                  <span className="badge-high">HIGH URGENCY</span>
                </div>
                <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginTop: '4px' }}>
                  Symptoms: Chest tightness and shortness of breath when climbing stairs.
                </p>
              </div>
              <button className="btn btn-secondary" onClick={() => alert('Opening consultation portal...')}>Consult</button>
            </div>

            <div style={{ background: 'rgba(15, 23, 42, 0.5)', padding: '16px', borderRadius: '12px', borderLeft: '4px solid var(--urgency-low)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                  <strong style={{ fontSize: '1.1rem' }}>Patient: Maria Garcia</strong>
                  <span className="badge-low">LOW URGENCY</span>
                </div>
                <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginTop: '4px' }}>
                  Symptoms: Routine annual heart checkup followup.
                </p>
              </div>
              <button className="btn btn-secondary" onClick={() => alert('Opening consultation portal...')}>Consult</button>
            </div>
          </div>
        </div>
      )}

      {/* Admin Dashboard */}
      {role === 'admin' && (
        <div className="glass-panel">
          <h2>Clinic Admin Management</h2>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginTop: '8px' }}>
            Create doctor profiles, set working hours, slot durations, and override leave schedules.
          </p>
        </div>
      )}
    </div>
  );
}
