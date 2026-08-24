import React, { useState, useRef, useEffect } from 'react';
import { api, getStoredToken, getStoredUser, setSession, clearSession } from './api';

export default function App() {
  // -------------------------------------------------------------
  // Authentication & Session State
  // -------------------------------------------------------------
  const [currentUser, setCurrentUser] = useState(getStoredUser());
  const [authMode, setAuthMode] = useState('login'); // 'login' | 'register'
  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState('');
  const [authForm, setAuthForm] = useState({
    name: '',
    email: '',
    password: '',
    role: 'patient'
  });

  // Shared Global Alerts
  const [globalError, setGlobalError] = useState('');
  const [globalSuccess, setGlobalSuccess] = useState('');

  // -------------------------------------------------------------
  // Patient Portal State
  // -------------------------------------------------------------
  const [patientTab, setPatientTab] = useState('book'); // 'book' | 'appointments'
  const [doctorsList, setDoctorsList] = useState([]);
  const [loadingDoctors, setLoadingDoctors] = useState(false);
  const [selectedSpecialization, setSelectedSpecialization] = useState('All');
  const [selectedDoctorId, setSelectedDoctorId] = useState('');
  const [selectedDate, setSelectedDate] = useState('2026-08-25');
  const [selectedTime, setSelectedTime] = useState('');
  const [availableSlots, setAvailableSlots] = useState([]);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [isDoctorLeave, setIsDoctorLeave] = useState(false);
  const [slotsMessage, setSlotsMessage] = useState('');

  // Slot Hold State & Countdown
  const [activeHold, setActiveHold] = useState(null); // { holdId, holdExpiresAt, timeSlot, date, doctorId }
  const [holdRemainingSeconds, setHoldRemainingSeconds] = useState(0);
  const [holdLoading, setHoldLoading] = useState(false);

  const [symptoms, setSymptoms] = useState('');
  const [bookingLoading, setBookingLoading] = useState(false);
  const [bookingResult, setBookingResult] = useState(null);

  // Patient Appointments State
  const [myAppointments, setMyAppointments] = useState([]);
  const [loadingAppointments, setLoadingAppointments] = useState(false);
  const [selectedPostVisitAppt, setSelectedPostVisitAppt] = useState(null);
  const [reschedulingAppt, setReschedulingAppt] = useState(null);
  const [newRescheduleDate, setNewRescheduleDate] = useState('2026-08-26');
  const [newRescheduleTime, setNewRescheduleTime] = useState('');
  const [rescheduleSlots, setRescheduleSlots] = useState([]);
  const [loadingRescheduleSlots, setLoadingRescheduleSlots] = useState(false);
  const [isRescheduleLeave, setIsRescheduleLeave] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);

  // Voice Input (Speech Recognition) State
  const [isListening, setIsListening] = useState(false);
  const [interimTranscript, setInterimTranscript] = useState('');
  const [micStatusMsg, setMicStatusMsg] = useState('');
  const recognitionRef = useRef(null);

  // -------------------------------------------------------------
  // Doctor Portal State
  // -------------------------------------------------------------
  const [doctorAppointments, setDoctorAppointments] = useState([]);
  const [consultingAppt, setConsultingAppt] = useState(null);
  const [clinicalNotes, setClinicalNotes] = useState('');
  const [consultationLoading, setConsultationLoading] = useState(false);
  const [showLeaveModal, setShowLeaveModal] = useState(false);
  const [leaveDate, setLeaveDate] = useState('');
  const [leaveReason, setLeaveReason] = useState('');
  const [leaveLoading, setLeaveLoading] = useState(false);

  // -------------------------------------------------------------
  // Admin Portal State
  // -------------------------------------------------------------
  const [adminDoctors, setAdminDoctors] = useState([]);
  const [adminAppointments, setAdminAppointments] = useState([]);
  const [adminSpecFilter, setAdminSpecFilter] = useState('All');
  const [showAddDoctorModal, setShowAddDoctorModal] = useState(false);
  const [editingDoctor, setEditingDoctor] = useState(null);
  const [newDoctorForm, setNewDoctorForm] = useState({
    name: '',
    email: '',
    password: 'password123',
    specialization: 'Cardiology',
    startTime: '09:00',
    endTime: '17:00',
    slotDuration: 30
  });
  const [adminActionLoading, setAdminActionLoading] = useState(false);

  // System Configuration Status
  const [configStatus, setConfigStatus] = useState(null);
  const [showConfigModal, setShowConfigModal] = useState(false);

  // -------------------------------------------------------------
  // Toast & Format Helpers
  // -------------------------------------------------------------
  const showToast = (msg, isError = false) => {
    if (isError) {
      setGlobalError(msg);
      setTimeout(() => setGlobalError(''), 5000);
    } else {
      setGlobalSuccess(msg);
      setTimeout(() => setGlobalSuccess(''), 5000);
    }
  };

  const fetchConfigStatus = async () => {
    try {
      const data = await api.getConfigStatus();
      setConfigStatus(data);
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    fetchConfigStatus();

    // Check for Google OAuth callback redirect parameters
    const params = new URLSearchParams(window.location.search);
    if (params.get('calendar_auth') === 'success') {
      showToast('Google Calendar connected successfully! Events will now sync automatically.');
      fetchConfigStatus();
      window.history.replaceState({}, document.title, window.location.pathname);
    } else if (params.get('calendar_auth') === 'failed') {
      const err = params.get('error') || 'OAuth authorization failed';
      showToast(`Google Calendar connection failed: ${decodeURIComponent(err)}`, true);
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  }, []);

  const formatTimer = (totalSecs) => {
    if (totalSecs <= 0) return '00:00';
    const m = Math.floor(totalSecs / 60);
    const s = totalSecs % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };

  // -------------------------------------------------------------
  // Active Hold Countdown Timer Loop
  // -------------------------------------------------------------
  useEffect(() => {
    if (!activeHold || holdRemainingSeconds <= 0) return;

    const timer = setInterval(() => {
      setHoldRemainingSeconds((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          setActiveHold(null);
          showToast('Slot hold expired. Please re-select an available slot.', true);
          if (selectedDoctorId && selectedDate) {
            fetchAvailableSlots(selectedDoctorId, selectedDate);
          }
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [activeHold, holdRemainingSeconds, selectedDoctorId, selectedDate]);

  // -------------------------------------------------------------
  // Session Restore on Mount
  // -------------------------------------------------------------
  useEffect(() => {
    const token = getStoredToken();
    if (token) {
      api.getMe()
        .then((userData) => {
          setCurrentUser(userData);
          setSession(token, userData);
        })
        .catch((err) => {
          console.warn('Session check failed:', err.message);
          clearSession();
          setCurrentUser(null);
        });
    }
  }, []);

  // -------------------------------------------------------------
  // Data Fetching Based on Role
  // -------------------------------------------------------------
  useEffect(() => {
    if (!currentUser) return;

    if (currentUser.role === 'patient') {
      fetchDoctorsForPatient(selectedSpecialization);
      fetchPatientAppointments();
    } else if (currentUser.role === 'doctor') {
      fetchDoctorAppointments();
    } else if (currentUser.role === 'admin') {
      fetchAdminData(adminSpecFilter);
    }
  }, [currentUser]);

  // Fetch doctors for Patient
  const fetchDoctorsForPatient = async (spec) => {
    setLoadingDoctors(true);
    try {
      const docs = await api.getDoctors(spec);
      setDoctorsList(docs);
      if (docs.length > 0) {
        const exists = docs.some((d) => d._id === selectedDoctorId);
        const targetDocId = exists ? selectedDoctorId : docs[0]._id;
        setSelectedDoctorId(targetDocId);
        fetchAvailableSlots(targetDocId, selectedDate);
      } else {
        setSelectedDoctorId('');
        setAvailableSlots([]);
      }
    } catch (err) {
      showToast(err.message, true);
    } finally {
      setLoadingDoctors(false);
    }
  };

  // -------------------------------------------------------------
  // Dynamic Available Slots Fetcher
  // -------------------------------------------------------------
  const fetchAvailableSlots = async (docId, date) => {
    if (!docId || !date) {
      setAvailableSlots([]);
      return;
    }

    setLoadingSlots(true);
    setIsDoctorLeave(false);
    setSlotsMessage('');

    try {
      const res = await api.getAvailableSlots(docId, date);
      if (res.isLeave) {
        setIsDoctorLeave(true);
        setAvailableSlots([]);
        setSelectedTime('');
        setActiveHold(null);
        setSlotsMessage(res.message || 'Doctor is on leave on this date');
      } else {
        setIsDoctorLeave(false);
        const slots = res.slots || [];
        setAvailableSlots(slots);
        setSlotsMessage(res.message || (slots.length === 0 ? 'No slots available' : 'Available slots'));
      }
    } catch (err) {
      setAvailableSlots([]);
      setSelectedTime('');
      setSlotsMessage(err.message);
    } finally {
      setLoadingSlots(false);
    }
  };

  // -------------------------------------------------------------
  // Slot Hold Action (Atomic 5-min Lock)
  // -------------------------------------------------------------
  const handleHoldSlot = async (slot) => {
    if (!selectedDoctorId || !selectedDate || !slot) return;

    setHoldLoading(true);
    try {
      const res = await api.holdSlot({
        doctorId: selectedDoctorId,
        date: selectedDate,
        timeSlot: slot
      });

      setSelectedTime(slot);
      setActiveHold({
        holdId: res.holdId,
        holdExpiresAt: res.holdExpiresAt,
        timeSlot: slot,
        date: selectedDate,
        doctorId: selectedDoctorId
      });

      const totalSecs = Math.max(0, Math.floor((new Date(res.holdExpiresAt).getTime() - Date.now()) / 1000));
      setHoldRemainingSeconds(totalSecs || 300);

      showToast(`Slot ${slot} reserved for 5 minutes.`);
    } catch (err) {
      showToast(err.message, true);
      fetchAvailableSlots(selectedDoctorId, selectedDate);
    } finally {
      setHoldLoading(false);
    }
  };

  // Fetch Reschedule Slots
  const fetchRescheduleSlots = async (docId, date) => {
    if (!docId || !date) {
      setRescheduleSlots([]);
      return;
    }

    setLoadingRescheduleSlots(true);
    setIsRescheduleLeave(false);

    try {
      const res = await api.getAvailableSlots(docId, date);
      if (res.isLeave) {
        setIsRescheduleLeave(true);
        setRescheduleSlots([]);
        setNewRescheduleTime('');
      } else {
        setIsRescheduleLeave(false);
        const slots = res.slots || [];
        setRescheduleSlots(slots);
        if (slots.length > 0) {
          setNewRescheduleTime((prev) => (slots.includes(prev) ? prev : slots[0]));
        } else {
          setNewRescheduleTime('');
        }
      }
    } catch (err) {
      setRescheduleSlots([]);
      setNewRescheduleTime('');
    } finally {
      setLoadingRescheduleSlots(false);
    }
  };

  // Trigger dynamic slot update when doctor or date changes in Patient booking
  useEffect(() => {
    if (currentUser?.role === 'patient' && selectedDoctorId && selectedDate) {
      setActiveHold(null);
      setHoldRemainingSeconds(0);
      setSelectedTime('');
      fetchAvailableSlots(selectedDoctorId, selectedDate);
    }
  }, [selectedDoctorId, selectedDate]);

  // Trigger dynamic slot update in Reschedule modal
  useEffect(() => {
    if (reschedulingAppt && newRescheduleDate) {
      const docId = reschedulingAppt.doctor?._id || reschedulingAppt.doctor;
      fetchRescheduleSlots(docId, newRescheduleDate);
    }
  }, [reschedulingAppt, newRescheduleDate]);

  // Fetch Patient's own appointments
  const fetchPatientAppointments = async () => {
    setLoadingAppointments(true);
    try {
      const appts = await api.getMyAppointments();
      setMyAppointments(appts);
    } catch (err) {
      showToast(err.message, true);
    } finally {
      setLoadingAppointments(false);
    }
  };

  // Fetch Doctor's appointments
  const fetchDoctorAppointments = async () => {
    setLoadingAppointments(true);
    try {
      const appts = await api.getMyAppointments();
      setDoctorAppointments(appts);
    } catch (err) {
      showToast(err.message, true);
    } finally {
      setLoadingAppointments(false);
    }
  };

  // Fetch Admin data
  const fetchAdminData = async (spec) => {
    setLoadingDoctors(true);
    try {
      const [docs, appts] = await Promise.all([
        api.getDoctors(spec),
        api.getMyAppointments()
      ]);
      setAdminDoctors(docs);
      setAdminAppointments(appts);
    } catch (err) {
      showToast(err.message, true);
    } finally {
      setLoadingDoctors(false);
    }
  };

  // -------------------------------------------------------------
  // Speech Recognition (Mic ON / OFF) Setup
  // -------------------------------------------------------------
  useEffect(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (SpeechRecognition) {
      const recognition = new SpeechRecognition();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = 'en-US';

      recognition.onstart = () => {
        setIsListening(true);
        setMicStatusMsg('Listening to your voice input...');
      };

      recognition.onresult = (event) => {
        let interim = '';
        let final = '';

        for (let i = event.resultIndex; i < event.results.length; i++) {
          const piece = event.results[i][0].transcript;
          if (event.results[i].isFinal) {
            final += piece + ' ';
          } else {
            interim += piece;
          }
        }

        if (final) {
          setSymptoms((prev) => (prev ? `${prev.trim()} ${final.trim()}` : final.trim()));
        }
        setInterimTranscript(interim);
      };

      recognition.onerror = (event) => {
        if (event.error === 'not-allowed') {
          setMicStatusMsg('Microphone access blocked in browser permissions.');
        } else if (event.error === 'no-speech') {
          setMicStatusMsg('Speak into microphone to describe symptoms.');
        } else {
          setMicStatusMsg(`Microphone notice: ${event.error}`);
        }
      };

      recognition.onend = () => {
        setIsListening(false);
        setInterimTranscript('');
      };

      recognitionRef.current = recognition;
    }

    return () => {
      try {
        recognitionRef.current?.stop();
      } catch {
        // ignore
      }
    };
  }, []);

  const toggleMic = () => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      alert('Speech Recognition is not supported by this browser. Please use Google Chrome or Microsoft Edge.');
      return;
    }

    if (isListening) {
      try {
        recognitionRef.current?.stop();
      } catch (err) {
        console.error(err);
      }
      setIsListening(false);
      setInterimTranscript('');
      setMicStatusMsg('');
    } else {
      try {
        setInterimTranscript('');
        recognitionRef.current?.start();
      } catch (err) {
        try {
          recognitionRef.current?.stop();
          setTimeout(() => recognitionRef.current?.start(), 150);
        } catch (e) {
          console.error(e);
        }
      }
    }
  };

  // -------------------------------------------------------------
  // Auth Handlers
  // -------------------------------------------------------------
  const handleAuthSubmit = async (e) => {
    e.preventDefault();
    setAuthError('');
    setAuthLoading(true);

    try {
      let data;
      if (authMode === 'login') {
        data = await api.login(authForm.email, authForm.password);
      } else {
        data = await api.register(authForm.name, authForm.email, authForm.password, authForm.role);
      }

      setSession(data.token, data);
      setCurrentUser(data);
      showToast(`Welcome back, ${data.name}.`);
    } catch (err) {
      setAuthError(err.message);
    } finally {
      setAuthLoading(false);
    }
  };

  const handleDemoLogin = async (email, password) => {
    setAuthError('');
    setAuthLoading(true);
    try {
      const data = await api.login(email, password);
      setSession(data.token, data);
      setCurrentUser(data);
      showToast(`Signed in as ${data.name} (${data.role.toUpperCase()})`);
    } catch (err) {
      setAuthError(`Sign in failed: ${err.message}.`);
    } finally {
      setAuthLoading(false);
    }
  };

  const handleLogout = () => {
    clearSession();
    setCurrentUser(null);
    setActiveHold(null);
    setMyAppointments([]);
    setDoctorAppointments([]);
    setAdminDoctors([]);
    showToast('Signed out successfully.');
  };

  // -------------------------------------------------------------
  // Patient Actions: Book, Cancel, Reschedule
  // -------------------------------------------------------------
  const handlePatientBook = async (e) => {
    e.preventDefault();
    if (!selectedDoctorId) {
      showToast('Please select a specialist doctor.', true);
      return;
    }
    if (!selectedTime) {
      showToast('Please select and hold an available time slot.', true);
      return;
    }
    if (!symptoms.trim()) {
      showToast('Please provide a symptom description before confirming.', true);
      return;
    }

    if (isListening) {
      recognitionRef.current?.stop();
      setIsListening(false);
    }

    setBookingLoading(true);
    setBookingResult(null);

    try {
      const payload = {
        holdId: activeHold?.holdId,
        doctorId: selectedDoctorId,
        date: selectedDate,
        timeSlot: selectedTime,
        symptoms
      };

      const res = await api.bookAppointment(payload);
      const appt = res.appointment || res;
      const cal = res.calendar;
      const email = res.email;

      setBookingResult({ ...appt, calendarStatus: cal, emailStatus: email });
      showToast(`Appointment confirmed for ${selectedTime}.`);
      setSymptoms('');
      setActiveHold(null);
      setHoldRemainingSeconds(0);

      fetchPatientAppointments();
      fetchAvailableSlots(selectedDoctorId, selectedDate);
    } catch (err) {
      showToast(err.message, true);
      if (err.status === 409) {
        setActiveHold(null);
        setHoldRemainingSeconds(0);
        fetchAvailableSlots(selectedDoctorId, selectedDate);
      }
    } finally {
      setBookingLoading(false);
    }
  };

  const handleCancelAppointment = async (apptId) => {
    if (!window.confirm('Are you sure you want to cancel this scheduled appointment?')) return;

    setActionLoading(true);
    try {
      await api.cancelAppointment(apptId);
      showToast('Appointment has been cancelled.');
      fetchPatientAppointments();
      fetchAvailableSlots(selectedDoctorId, selectedDate);
      if (currentUser.role === 'doctor') fetchDoctorAppointments();
    } catch (err) {
      showToast(err.message, true);
    } finally {
      setActionLoading(false);
    }
  };

  const handleRescheduleSubmit = async (e) => {
    e.preventDefault();
    if (!reschedulingAppt || !newRescheduleTime) {
      showToast('Please select an available time slot.', true);
      return;
    }

    setActionLoading(true);
    try {
      await api.rescheduleAppointment(reschedulingAppt._id, newRescheduleDate, newRescheduleTime);
      showToast(`Appointment rescheduled to ${newRescheduleDate} at ${newRescheduleTime}.`);
      setReschedulingAppt(null);
      fetchPatientAppointments();
      fetchAvailableSlots(selectedDoctorId, selectedDate);
    } catch (err) {
      showToast(err.message, true);
    } finally {
      setActionLoading(false);
    }
  };

  // -------------------------------------------------------------
  // Doctor Actions
  // -------------------------------------------------------------
  const handleDoctorSubmitPostVisit = async (e) => {
    e.preventDefault();
    if (!consultingAppt || !clinicalNotes.trim()) {
      showToast('Please enter clinical consultation notes.', true);
      return;
    }

    setConsultationLoading(true);
    try {
      const updated = await api.submitPostVisit(consultingAppt._id, clinicalNotes);
      showToast('Clinical notes saved and AI patient summary generated.');
      setConsultingAppt(updated);
      fetchDoctorAppointments();
    } catch (err) {
      showToast(err.message, true);
    } finally {
      setConsultationLoading(false);
    }
  };

  const handleDoctorLeaveSubmit = async (e) => {
    e.preventDefault();
    if (!leaveDate) {
      showToast('Please select a leave date.', true);
      return;
    }

    setLeaveLoading(true);
    try {
      const res = await api.markDoctorLeave(leaveDate, leaveReason);
      showToast(res.message || 'Leave day recorded and affected patients notified.');
      setShowLeaveModal(false);
      setLeaveDate('');
      setLeaveReason('');
      fetchDoctorAppointments();
    } catch (err) {
      showToast(err.message, true);
    } finally {
      setLeaveLoading(false);
    }
  };

  // -------------------------------------------------------------
  // Admin Actions
  // -------------------------------------------------------------
  const handleAdminCreateDoctor = async (e) => {
    e.preventDefault();
    setAdminActionLoading(true);
    try {
      await api.createDoctor({
        name: newDoctorForm.name,
        email: newDoctorForm.email,
        password: newDoctorForm.password,
        specialization: newDoctorForm.specialization,
        workingHours: { start: newDoctorForm.startTime, end: newDoctorForm.endTime },
        slotDuration: Number(newDoctorForm.slotDuration)
      });

      showToast(`Doctor profile for ${newDoctorForm.name} created.`);
      setShowAddDoctorModal(false);
      setNewDoctorForm({
        name: '',
        email: '',
        password: 'password123',
        specialization: 'Cardiology',
        startTime: '09:00',
        endTime: '17:00',
        slotDuration: 30
      });
      fetchAdminData(adminSpecFilter);
    } catch (err) {
      showToast(err.message, true);
    } finally {
      setAdminActionLoading(false);
    }
  };

  const handleAdminUpdateDoctor = async (e) => {
    e.preventDefault();
    if (!editingDoctor) return;

    setAdminActionLoading(true);
    try {
      await api.updateDoctor(editingDoctor._id, {
        specialization: editingDoctor.specialization,
        workingHours: editingDoctor.workingHours,
        slotDuration: Number(editingDoctor.slotDuration)
      });

      showToast(`Profile for ${editingDoctor.user?.name || 'Doctor'} updated.`);
      setEditingDoctor(null);
      fetchAdminData(adminSpecFilter);
    } catch (err) {
      showToast(err.message, true);
    } finally {
      setAdminActionLoading(false);
    }
  };

  const handleAdminDeleteDoctor = async (docId, docName) => {
    if (!window.confirm(`Are you sure you want to delete profile for ${docName}?`)) return;

    setAdminActionLoading(true);
    try {
      await api.deleteDoctor(docId);
      showToast(`Profile for ${docName} deleted.`);
      fetchAdminData(adminSpecFilter);
    } catch (err) {
      showToast(err.message, true);
    } finally {
      setAdminActionLoading(false);
    }
  };

  // Find upcoming scheduled appointment for Patient
  const upcomingAppointment = currentUser?.role === 'patient'
    ? myAppointments.find((a) => a.status === 'Scheduled')
    : null;

  // -------------------------------------------------------------
  // RENDER: Unauthenticated View (Clean Sign In / Register)
  // -------------------------------------------------------------
  if (!currentUser) {
    return (
      <div className="app-container" style={{ background: '#f8fafc', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px' }}>
        <div style={{ maxWidth: '440px', width: '100%' }}>
          {/* Brand Header */}
          <div style={{ textAlign: 'center', marginBottom: '24px' }}>
            <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '44px', height: '44px', borderRadius: '10px', background: 'var(--primary)', color: '#fff', fontSize: '1.4rem', fontWeight: 800, marginBottom: '12px' }}>
              +
            </div>
            <h1 style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--text-main)', letterSpacing: '-0.02em' }}>
              HealthPulse AI
            </h1>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginTop: '2px' }}>
              Healthcare Appointment & Clinical Follow-up
            </p>
          </div>

          {/* Toast feedback */}
          {globalError && (
            <div style={{ marginBottom: '14px', padding: '10px 14px', background: 'var(--urgency-high-bg)', border: '1px solid var(--urgency-high-border)', borderRadius: 'var(--radius-sm)', color: 'var(--urgency-high-text)', fontSize: '0.82rem' }}>
              {globalError}
            </div>
          )}
          {globalSuccess && (
            <div style={{ marginBottom: '14px', padding: '10px 14px', background: 'var(--accent-subtle)', border: '1px solid var(--accent-border)', borderRadius: 'var(--radius-sm)', color: 'var(--urgency-low-text)', fontSize: '0.82rem' }}>
              {globalSuccess}
            </div>
          )}

          {/* Auth Card */}
          <div className="card-panel" style={{ padding: '28px', marginBottom: '16px' }}>
            {/* Tabs */}
            <div style={{ display: 'flex', borderBottom: '1px solid var(--border-light)', marginBottom: '20px' }}>
              <button
                type="button"
                onClick={() => { setAuthMode('login'); setAuthError(''); }}
                style={{
                  flex: 1,
                  padding: '8px',
                  background: 'transparent',
                  border: 'none',
                  borderBottom: authMode === 'login' ? '2px solid var(--primary)' : '2px solid transparent',
                  color: authMode === 'login' ? 'var(--primary)' : 'var(--text-muted)',
                  fontWeight: 600,
                  fontSize: '0.86rem',
                  cursor: 'pointer'
                }}
              >
                Sign In
              </button>
              <button
                type="button"
                onClick={() => { setAuthMode('register'); setAuthError(''); }}
                style={{
                  flex: 1,
                  padding: '8px',
                  background: 'transparent',
                  border: 'none',
                  borderBottom: authMode === 'register' ? '2px solid var(--primary)' : '2px solid transparent',
                  color: authMode === 'register' ? 'var(--primary)' : 'var(--text-muted)',
                  fontWeight: 600,
                  fontSize: '0.86rem',
                  cursor: 'pointer'
                }}
              >
                Register Account
              </button>
            </div>

            {authError && (
              <div style={{ marginBottom: '14px', padding: '8px 12px', background: 'var(--urgency-high-bg)', border: '1px solid var(--urgency-high-border)', borderRadius: 'var(--radius-sm)', color: 'var(--urgency-high-text)', fontSize: '0.8rem' }}>
                {authError}
              </div>
            )}

            <form onSubmit={handleAuthSubmit}>
              {authMode === 'register' && (
                <div className="form-group">
                  <label className="form-label">Full Name</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Alex Rivera"
                    className="form-input"
                    value={authForm.name}
                    onChange={(e) => setAuthForm({ ...authForm, name: e.target.value })}
                  />
                </div>
              )}

              <div className="form-group">
                <label className="form-label">Email Address</label>
                <input
                  type="email"
                  required
                  placeholder="name@clinic.com"
                  className="form-input"
                  value={authForm.email}
                  onChange={(e) => setAuthForm({ ...authForm, email: e.target.value })}
                />
              </div>

              <div className="form-group">
                <label className="form-label">Password</label>
                <input
                  type="password"
                  required
                  placeholder="••••••••"
                  className="form-input"
                  value={authForm.password}
                  onChange={(e) => setAuthForm({ ...authForm, password: e.target.value })}
                />
              </div>

              {authMode === 'register' && (
                <div className="form-group">
                  <label className="form-label">Account Role</label>
                  <select
                    className="form-select"
                    value={authForm.role}
                    onChange={(e) => setAuthForm({ ...authForm, role: e.target.value })}
                  >
                    <option value="patient">Patient</option>
                    <option value="doctor">Doctor</option>
                    <option value="admin">Clinic Administrator</option>
                  </select>
                </div>
              )}

              <button
                type="submit"
                className="btn btn-primary"
                disabled={authLoading}
                style={{ width: '100%', marginTop: '8px', padding: '10px' }}
              >
                {authLoading ? 'Signing in...' : authMode === 'login' ? 'Sign In to HealthPulse' : 'Create Clinical Account'}
              </button>
            </form>

            {/* Quick Demo Logins for Evaluator */}
            <div style={{ marginTop: '24px', paddingTop: '16px', borderTop: '1px solid var(--border-light)' }}>
              <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', display: 'block', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.04em', fontWeight: 600 }}>
                Evaluator Demo Accounts:
              </span>
              <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() => handleDemoLogin('alex.rivera@example.com', 'password123')}
                >
                  👤 Patient (Alex)
                </button>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() => handleDemoLogin('sarah.jenkins@clinic.com', 'password123')}
                >
                  🩺 Doctor (Dr. Sarah)
                </button>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() => handleDemoLogin('admin@clinic.com', 'password123')}
                >
                  ⚡ Admin
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // -------------------------------------------------------------
  // RENDER: Authenticated Dashboard (Patient / Doctor / Admin)
  // -------------------------------------------------------------
  return (
    <div className="app-container">
      {/* Top Clinical Navigation Bar */}
      <header className="top-navbar">
        <div className="navbar-inner">
          <div className="brand-group">
            <div className="brand-logo-mark">+</div>
            <div>
              <div className="brand-title">HealthPulse AI</div>
              <div className="brand-subtitle">Healthcare Appointment & Follow-up</div>
            </div>
          </div>

          <div className="nav-user-profile">
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              style={{ fontSize: '0.76rem', display: 'flex', alignItems: 'center', gap: '4px' }}
              onClick={() => {
                fetchConfigStatus();
                setShowConfigModal(true);
              }}
              title="View live backend integrations status"
            >
              ⚙️ Integrations
              {configStatus?.gemini === 'CONFIGURED' && <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#10b981' }} />}
            </button>

            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: '0.84rem', fontWeight: 600, color: 'var(--text-main)' }}>
                {currentUser.name}
              </div>
              <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>
                {currentUser.email}
              </div>
            </div>

            <span className="user-badge-role">
              {currentUser.role} portal
            </span>

            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={handleLogout}
              title="Sign out of HealthPulse"
            >
              Sign out
            </button>
          </div>
        </div>
      </header>

      {/* System Integrations Status Modal */}
      {showConfigModal && configStatus && (
        <div className="modal-overlay">
          <div className="modal-dialog" style={{ maxWidth: '480px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', borderBottom: '1px solid var(--border-light)', paddingBottom: '10px' }}>
              <div>
                <h3 style={{ fontSize: '1.1rem', fontWeight: 700 }}>System Integrations Status</h3>
                <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>Live backend credential & service audit</p>
              </div>
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => setShowConfigModal(false)}>✕</button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 12px', background: 'var(--bg-subtle)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-light)' }}>
                <div>
                  <strong style={{ fontSize: '0.85rem' }}>🤖 Google Gemini AI</strong>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>GEMINI_API_KEY</div>
                </div>
                <span className={`status-pill ${configStatus.gemini === 'CONFIGURED' ? 'status-completed' : 'status-scheduled'}`}>
                  {configStatus.gemini === 'CONFIGURED' ? '✓ Configured (Live)' : 'Deterministic Fallback'}
                </span>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 12px', background: 'var(--bg-subtle)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-light)' }}>
                <div>
                  <strong style={{ fontSize: '0.85rem' }}>📧 Nodemailer (Email)</strong>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>EMAIL_USER / EMAIL_PASS</div>
                </div>
                <span className={`status-pill ${configStatus.email.includes('CONFIGURED') ? 'status-completed' : 'status-scheduled'}`}>
                  {configStatus.email}
                </span>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px', background: 'var(--bg-subtle)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-light)', flexWrap: 'wrap', gap: '10px' }}>
                <div>
                  <strong style={{ fontSize: '0.85rem' }}>📅 Google Calendar</strong>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>OAuth 2.0 Real-time Events Sync</div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                  {configStatus.googleCalendar === 'CONFIGURED' ? (
                    <span className="status-pill status-completed">
                      ✓ Configured (Live)
                    </span>
                  ) : (
                    <span className="status-pill status-scheduled">
                      {configStatus.googleOAuth?.status === 'READY_TO_CONNECT' ? 'Ready to Connect' : 'Setup Required'}
                    </span>
                  )}
                  <a
                    href="http://localhost:5000/api/auth/google?redirect=true"
                    className="btn btn-primary btn-sm"
                    style={{ textDecoration: 'none', padding: '5px 12px', fontSize: '0.76rem', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                    title="Connect or Re-authenticate Google Calendar"
                  >
                    🔗 {configStatus.googleCalendar === 'CONFIGURED' ? 'Reconnect Calendar' : 'Connect Calendar'}
                  </a>
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 12px', background: 'var(--bg-subtle)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-light)' }}>
                <div>
                  <strong style={{ fontSize: '0.85rem' }}>🗄️ MongoDB Database</strong>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>MONGO_URI</div>
                </div>
                <span className={`status-pill ${configStatus.database === 'CONNECTED' ? 'status-completed' : 'status-cancelled'}`}>
                  {configStatus.database === 'CONNECTED' ? '✓ Connected' : 'Disconnected'}
                </span>
              </div>
            </div>

            <div style={{ marginTop: '16px', display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
              <button type="button" className="btn btn-secondary btn-sm" onClick={fetchConfigStatus}>🔄 Refresh Status</button>
              <button type="button" className="btn btn-primary btn-sm" onClick={() => setShowConfigModal(false)}>Close</button>
            </div>
          </div>
        </div>
      )}

      {/* Main Workspace Area */}
      <main className="main-content">
        {/* Global Alert Banners */}
        {globalError && (
          <div style={{ marginBottom: '16px', padding: '10px 16px', background: 'var(--urgency-high-bg)', border: '1px solid var(--urgency-high-border)', borderRadius: 'var(--radius-sm)', color: 'var(--urgency-high-text)', fontSize: '0.85rem' }}>
            {globalError}
          </div>
        )}
        {globalSuccess && (
          <div style={{ marginBottom: '16px', padding: '10px 16px', background: 'var(--accent-subtle)', border: '1px solid var(--accent-border)', borderRadius: 'var(--radius-sm)', color: 'var(--urgency-low-text)', fontSize: '0.85rem' }}>
            {globalSuccess}
          </div>
        )}

        {/* ========================================================= */}
        {/* 1. PATIENT PORTAL */}
        {/* ========================================================= */}
        {currentUser.role === 'patient' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            {/* Top Greeting & Upcoming Appointment Highlight */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '16px' }}>
              <div>
                <h2 style={{ fontSize: '1.4rem', fontWeight: 700, color: 'var(--text-main)', letterSpacing: '-0.02em' }}>
                  Good day, {currentUser.name.split(' ')[0]}
                </h2>
                <p style={{ color: 'var(--text-muted)', fontSize: '0.86rem' }}>
                  Schedule consultations with clinic specialists and track your clinical follow-up plans.
                </p>
              </div>

              {/* Navigation Tabs */}
              <div style={{ display: 'flex', gap: '6px', background: 'var(--bg-subtle)', padding: '3px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-light)' }}>
                <button
                  type="button"
                  className={`btn btn-sm ${patientTab === 'book' ? 'btn-primary' : 'btn-secondary'}`}
                  style={{ border: patientTab === 'book' ? 'none' : 'transparent' }}
                  onClick={() => setPatientTab('book')}
                >
                  📅 Book Specialist
                </button>
                <button
                  type="button"
                  className={`btn btn-sm ${patientTab === 'appointments' ? 'btn-primary' : 'btn-secondary'}`}
                  style={{ border: patientTab === 'appointments' ? 'none' : 'transparent' }}
                  onClick={() => setPatientTab('appointments')}
                >
                  📋 My Appointments ({myAppointments.length})
                </button>
              </div>
            </div>

            {/* Upcoming Appointment Highlight Card */}
            {upcomingAppointment && (
              <div style={{ background: 'var(--primary-subtle)', border: '1px solid var(--primary-border)', borderRadius: 'var(--radius-md)', padding: '16px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
                <div>
                  <span style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--primary)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                    Upcoming Confirmed Consultation
                  </span>
                  <div style={{ fontSize: '1.05rem', fontWeight: 700, color: 'var(--text-main)', marginTop: '2px' }}>
                    {upcomingAppointment.doctor?.user?.name || 'Specialist Doctor'} — {upcomingAppointment.doctor?.specialization}
                  </div>
                  <div style={{ fontSize: '0.84rem', color: 'var(--text-body)', marginTop: '2px' }}>
                    📅 {new Date(upcomingAppointment.date).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })} at <strong>{upcomingAppointment.timeSlot}</strong>
                  </div>
                </div>

                <div style={{ display: 'flex', gap: '8px' }}>
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={() => {
                      setPatientTab('appointments');
                    }}
                  >
                    View All Appointments
                  </button>
                </div>
              </div>
            )}

            {/* TAB 1: Booking Workflow */}
            {patientTab === 'book' && (
              <div className="grid-2col">
                {/* Left Column: Multi-Step Booking Form */}
                <div className="card-panel">
                  <div className="card-panel-header">
                    <div>
                      <h3 className="card-title">Book Specialist Appointment</h3>
                      <p className="card-subtitle">Choose doctor, date, and reserve a dynamic slot.</p>
                    </div>
                    <span className="ai-clinical-badge">Dynamic Slot Calculation</span>
                  </div>

                  <form onSubmit={handlePatientBook}>
                    {/* Step 1: Specialization & Doctor Selection */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '14px' }}>
                      <div className="form-group" style={{ marginBottom: 0 }}>
                        <label className="form-label">1. Medical Specialization</label>
                        <select
                          className="form-select"
                          value={selectedSpecialization}
                          onChange={(e) => {
                            setSelectedSpecialization(e.target.value);
                            fetchDoctorsForPatient(e.target.value);
                          }}
                        >
                          <option value="All">All Specializations</option>
                          <option value="Cardiology">Cardiology</option>
                          <option value="Neurology">Neurology</option>
                          <option value="General Medicine">General Medicine</option>
                          <option value="Dermatology">Dermatology</option>
                          <option value="Orthopedics">Orthopedics</option>
                        </select>
                      </div>

                      <div className="form-group" style={{ marginBottom: 0 }}>
                        <label className="form-label">
                          2. Attending Specialist ({loadingDoctors ? '...' : doctorsList.length})
                        </label>
                        <select
                          className="form-select"
                          value={selectedDoctorId}
                          onChange={(e) => setSelectedDoctorId(e.target.value)}
                          required
                        >
                          {doctorsList.length === 0 ? (
                            <option value="">No specialists registered</option>
                          ) : (
                            doctorsList.map((doc) => (
                              <option key={doc._id} value={doc._id}>
                                {doc.user?.name || 'Doctor'} ({doc.workingHours?.start} - {doc.workingHours?.end})
                              </option>
                            ))
                          )}
                        </select>
                      </div>
                    </div>

                    {/* Step 2: Date & Dynamic Available Time Slots */}
                    <div className="form-group">
                      <label className="form-label">3. Appointment Date</label>
                      <input
                        type="date"
                        required
                        className="form-input"
                        value={selectedDate}
                        onChange={(e) => setSelectedDate(e.target.value)}
                      />
                    </div>

                    <div className="form-group">
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <label className="form-label">4. Select Available Slot to Hold (5-Min Reservation)</label>
                        <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                          {availableSlots.length} bookable slot(s)
                        </span>
                      </div>

                      {loadingSlots ? (
                        <div style={{ padding: '12px', fontSize: '0.82rem', color: 'var(--text-muted)', background: 'var(--bg-subtle)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-light)' }}>
                          Loading available slots from clinic schedule...
                        </div>
                      ) : isDoctorLeave ? (
                        <div style={{ padding: '12px', fontSize: '0.82rem', color: 'var(--urgency-high-text)', background: 'var(--urgency-high-bg)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--urgency-high-border)' }}>
                          Doctor is on leave on this date. Please pick another date.
                        </div>
                      ) : availableSlots.length === 0 ? (
                        <div style={{ padding: '12px', fontSize: '0.82rem', color: 'var(--urgency-med-text)', background: 'var(--urgency-med-bg)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--urgency-med-border)' }}>
                          No available slots for this date (All slots booked or outside working hours).
                        </div>
                      ) : (
                        <div className="slot-grid">
                          {availableSlots.map((slot) => {
                            const isSelected = selectedTime === slot;
                            return (
                              <button
                                key={slot}
                                type="button"
                                onClick={() => handleHoldSlot(slot)}
                                disabled={holdLoading}
                                className={`slot-chip ${isSelected ? 'selected' : ''}`}
                              >
                                {isSelected ? '🔒 ' : ''}{slot}
                              </button>
                            );
                          })}
                        </div>
                      )}

                      {/* Active Slot Hold Timer Card */}
                      {activeHold && (
                        <div className="hold-timer-banner">
                          <div>
                            <div style={{ fontSize: '0.88rem', fontWeight: 600, color: 'var(--text-main)' }}>
                              Slot {activeHold.timeSlot} reserved for you
                            </div>
                            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                              Held exclusively in clinic database
                            </div>
                          </div>

                          <div style={{ textAlign: 'right' }}>
                            <div className="hold-time-text">
                              {formatTimer(holdRemainingSeconds)}
                            </div>
                            <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                              remaining to confirm
                            </div>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Step 3: Clinical Symptoms Input & Voice Mic */}
                    <div className="form-group">
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                        <label className="form-label">5. Reason for Visit / Patient Symptoms</label>

                        {/* Mic Button */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          {symptoms && (
                            <button
                              type="button"
                              onClick={() => setSymptoms('')}
                              style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: '0.74rem', cursor: 'pointer', textDecoration: 'underline' }}
                            >
                              Clear
                            </button>
                          )}

                          <button
                            type="button"
                            onClick={toggleMic}
                            className={`speech-mic-button ${isListening ? 'active-recording' : ''}`}
                            title={isListening ? 'Stop Voice Input' : 'Start Voice Input'}
                          >
                            {isListening && <span className="recording-pulse-dot" />}
                            {isListening ? 'Recording Voice...' : '🎙️ Voice Input (Speak)'}
                          </button>
                        </div>
                      </div>

                      <div style={{ position: 'relative' }}>
                        <textarea
                          className="form-textarea"
                          rows={3}
                          placeholder="Describe symptoms, duration, and medical history or use voice input..."
                          value={symptoms}
                          onChange={(e) => setSymptoms(e.target.value)}
                        />
                        {interimTranscript && (
                          <div style={{ position: 'absolute', bottom: '6px', left: '10px', right: '10px', background: 'var(--bg-subtle)', padding: '4px 8px', borderRadius: '4px', fontSize: '0.76rem', color: 'var(--secondary)', fontStyle: 'italic', border: '1px solid var(--border-light)' }}>
                            Hearing: "{interimTranscript}"
                          </div>
                        )}
                      </div>

                      {micStatusMsg && (
                        <p style={{ fontSize: '0.74rem', color: 'var(--text-muted)', marginTop: '3px' }}>
                          {micStatusMsg}
                        </p>
                      )}
                    </div>

                    {/* Submit Confirmation Button */}
                    <button
                      type="submit"
                      className="btn btn-primary"
                      disabled={bookingLoading || !activeHold || holdRemainingSeconds <= 0}
                      style={{ width: '100%', padding: '10px', marginTop: '6px' }}
                    >
                      {bookingLoading
                        ? 'Confirming & Generating Clinical Triage...'
                        : activeHold
                          ? `Confirm Booking for ${activeHold.timeSlot}`
                          : 'Select an Available Slot Above to Reserve First'}
                    </button>
                  </form>
                </div>

                {/* Right Column: AI-Assisted Pre-Visit Assessment Panel */}
                <div className="card-panel">
                  <div className="card-panel-header">
                    <div>
                      <h3 className="card-title">AI-Assisted Clinical Assessment</h3>
                      <p className="card-subtitle">Automated triage for attending doctor review.</p>
                    </div>
                    <span className={bookingResult?.preVisitSummary?.isFallback ? 'status-pill status-scheduled' : 'ai-clinical-badge'}>
                      {bookingResult?.preVisitSummary?.isFallback ? 'Deterministic Fallback' : 'Google Gemini 1.5 Flash'}
                    </span>
                  </div>

                  {bookingResult ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                      {/* Success Box */}
                      <div style={{ padding: '10px 14px', background: 'var(--accent-subtle)', border: '1px solid var(--accent-border)', borderRadius: 'var(--radius-sm)', color: 'var(--urgency-low-text)', fontSize: '0.84rem' }}>
                        ✓ Appointment successfully recorded in database (ID: {bookingResult._id?.slice(-6)})
                      </div>

                      {/* Calendar Status */}
                      {bookingResult.calendarStatus && (
                        <div style={{ padding: '8px 12px', borderRadius: 'var(--radius-sm)', fontSize: '0.8rem', background: bookingResult.calendarStatus.success ? 'var(--accent-subtle)' : 'var(--bg-subtle)', border: `1px solid ${bookingResult.calendarStatus.success ? 'var(--accent-border)' : 'var(--border-light)'}`, color: bookingResult.calendarStatus.success ? 'var(--urgency-low-text)' : 'var(--text-muted)' }}>
                          {bookingResult.calendarStatus.success
                            ? `✓ Google Calendar Event Synced (ID: ${bookingResult.calendarStatus.eventId})`
                            : `⚠ ${bookingResult.calendarStatus.message}`}
                        </div>
                      )}

                      {/* Email Status */}
                      {bookingResult.emailStatus && (
                        <div style={{ padding: '8px 12px', borderRadius: 'var(--radius-sm)', fontSize: '0.8rem', background: bookingResult.emailStatus.status === 'EMAIL_SENT' ? 'var(--accent-subtle)' : 'var(--bg-subtle)', border: `1px solid ${bookingResult.emailStatus.status === 'EMAIL_SENT' ? 'var(--accent-border)' : 'var(--border-light)'}`, color: bookingResult.emailStatus.status === 'EMAIL_SENT' ? 'var(--urgency-low-text)' : 'var(--text-muted)' }}>
                          {bookingResult.emailStatus.status === 'EMAIL_SENT'
                            ? `✓ ${bookingResult.emailStatus.message || 'Confirmation email dispatched'}`
                            : `⚠ Email notice: ${bookingResult.emailStatus.message}`}
                        </div>
                      )}

                      {/* Urgency */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>Urgency Level:</span>
                        <span className={bookingResult.preVisitSummary?.urgencyLevel === 'High' ? 'urgency-badge-high status-pill' : bookingResult.preVisitSummary?.urgencyLevel === 'Medium' ? 'urgency-badge-medium status-pill' : 'urgency-badge-low status-pill'}>
                          {bookingResult.preVisitSummary?.urgencyLevel || 'Medium'} Urgency
                        </span>
                      </div>

                      {/* Chief Complaint */}
                      <div>
                        <span style={{ fontSize: '0.74rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600, display: 'block', marginBottom: '4px' }}>
                          Chief Complaint
                        </span>
                        <div style={{ background: 'var(--bg-subtle)', padding: '10px 12px', borderRadius: 'var(--radius-sm)', fontSize: '0.85rem', border: '1px solid var(--border-light)', color: 'var(--text-main)' }}>
                          {bookingResult.preVisitSummary?.chiefComplaint || bookingResult.symptoms}
                        </div>
                      </div>

                      {/* Suggested Questions */}
                      <div>
                        <span style={{ fontSize: '0.74rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600, display: 'block', marginBottom: '4px' }}>
                          Suggested Clinical Questions For Doctor
                        </span>
                        <ul style={{ paddingLeft: '18px', fontSize: '0.82rem', color: 'var(--text-body)', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                          {(bookingResult.preVisitSummary?.suggestedQuestions || []).map((q, i) => (
                            <li key={i}>{q}</li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  ) : symptoms ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>Estimated Urgency:</span>
                        <span className={symptoms.toLowerCase().includes('chest') || symptoms.toLowerCase().includes('severe') ? 'urgency-badge-high status-pill' : 'urgency-badge-medium status-pill'}>
                          {symptoms.toLowerCase().includes('chest') || symptoms.toLowerCase().includes('severe') ? 'High Urgency' : 'Medium Urgency'}
                        </span>
                      </div>

                      <div>
                        <span style={{ fontSize: '0.74rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600, display: 'block', marginBottom: '4px' }}>
                          Current Symptom Description
                        </span>
                        <div style={{ background: 'var(--bg-subtle)', padding: '10px 12px', borderRadius: 'var(--radius-sm)', fontSize: '0.85rem', color: 'var(--text-body)' }}>
                          {symptoms}
                        </div>
                      </div>

                      <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                        Confirming your slot will run Google Gemini LLM extraction to structure clinical questions for your doctor.
                      </p>
                    </div>
                  ) : (
                    <div style={{ textAlign: 'center', padding: '40px 16px', color: 'var(--text-muted)' }}>
                      <div style={{ fontSize: '1.4rem', marginBottom: '8px' }}>🩺</div>
                      <p style={{ fontSize: '0.85rem' }}>
                        Select an available slot on the left and enter symptoms to preview automated clinical triage.
                      </p>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* TAB 2: Patient's My Appointments List */}
            {patientTab === 'appointments' && (
              <div className="card-panel">
                <div className="card-panel-header">
                  <div>
                    <h3 className="card-title">My Appointment History & Care Plans</h3>
                    <p className="card-subtitle">View scheduled consultations, visit summaries, and prescriptions.</p>
                  </div>
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={fetchPatientAppointments}
                    disabled={loadingAppointments}
                  >
                    Refresh
                  </button>
                </div>

                {loadingAppointments ? (
                  <p style={{ color: 'var(--text-muted)', fontSize: '0.86rem' }}>Loading appointment records...</p>
                ) : myAppointments.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '30px 16px', color: 'var(--text-muted)' }}>
                    <p style={{ fontSize: '0.88rem' }}>No appointment records found.</p>
                    <button
                      type="button"
                      className="btn btn-primary btn-sm"
                      style={{ marginTop: '10px' }}
                      onClick={() => setPatientTab('book')}
                    >
                      Book First Consultation
                    </button>
                  </div>
                ) : (
                  <div className="data-table-wrapper">
                    <table className="data-table">
                      <thead>
                        <tr>
                          <th>Doctor & Specialization</th>
                          <th>Consultation Date</th>
                          <th>Reported Symptoms</th>
                          <th>Urgency</th>
                          <th>Status</th>
                          <th>Post-Visit Care Plan</th>
                          <th>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {myAppointments.map((appt) => (
                          <tr key={appt._id}>
                            <td>
                              <strong>{appt.doctor?.user?.name || 'Specialist'}</strong>
                              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                                {appt.doctor?.specialization || 'General Clinic'}
                              </div>
                            </td>
                            <td>
                              <div>{new Date(appt.date).toLocaleDateString()}</div>
                              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontVariantNumeric: 'tabular-nums' }}>
                                {appt.timeSlot}
                              </div>
                            </td>
                            <td style={{ maxWidth: '200px' }}>
                              <div style={{ fontSize: '0.82rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                {appt.symptoms}
                              </div>
                            </td>
                            <td>
                              <span className={appt.preVisitSummary?.urgencyLevel === 'High' ? 'urgency-badge-high status-pill' : appt.preVisitSummary?.urgencyLevel === 'Medium' ? 'urgency-badge-medium status-pill' : 'urgency-badge-low status-pill'}>
                                {appt.preVisitSummary?.urgencyLevel || 'Routine'}
                              </span>
                            </td>
                            <td>
                              <span className={`status-pill ${appt.status === 'Completed' ? 'status-completed' : appt.status === 'Cancelled' ? 'status-cancelled' : 'status-scheduled'}`}>
                                {appt.status}
                              </span>
                            </td>
                            <td>
                              {appt.postVisitSummary?.patientSummary ? (
                                <button
                                  type="button"
                                  className="btn btn-sm btn-primary"
                                  onClick={() => setSelectedPostVisitAppt(appt)}
                                >
                                  View Care Plan
                                </button>
                              ) : appt.status === 'Completed' ? (
                                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>Pending doctor notes</span>
                              ) : (
                                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Pending visit</span>
                              )}
                            </td>
                            <td>
                              {appt.status === 'Scheduled' && (
                                <div style={{ display: 'flex', gap: '6px' }}>
                                  <button
                                    type="button"
                                    className="btn btn-secondary btn-sm"
                                    onClick={() => {
                                      setReschedulingAppt(appt);
                                      setNewRescheduleDate(new Date(appt.date).toISOString().split('T')[0]);
                                    }}
                                  >
                                    Reschedule
                                  </button>
                                  <button
                                    type="button"
                                    className="btn btn-danger btn-sm"
                                    onClick={() => handleCancelAppointment(appt._id)}
                                    disabled={actionLoading}
                                  >
                                    Cancel
                                  </button>
                                </div>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

            {/* Dynamic Reschedule Modal */}
            {reschedulingAppt && (
              <div className="modal-overlay">
                <div className="modal-dialog">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                    <h3 style={{ fontSize: '1.1rem', fontWeight: 600 }}>Reschedule Appointment</h3>
                    <button type="button" className="btn btn-secondary btn-sm" onClick={() => setReschedulingAppt(null)}>✕</button>
                  </div>

                  <form onSubmit={handleRescheduleSubmit}>
                    <div className="form-group">
                      <label className="form-label">New Appointment Date</label>
                      <input
                        type="date"
                        required
                        className="form-input"
                        value={newRescheduleDate}
                        onChange={(e) => setNewRescheduleDate(e.target.value)}
                      />
                    </div>

                    <div className="form-group">
                      <label className="form-label">Available Time Slot</label>
                      {loadingRescheduleSlots ? (
                        <div style={{ padding: '8px', fontSize: '0.82rem', color: 'var(--text-muted)' }}>Loading slots...</div>
                      ) : isRescheduleLeave ? (
                        <div style={{ padding: '8px', fontSize: '0.82rem', color: 'var(--urgency-high-text)' }}>Doctor is on leave on this date.</div>
                      ) : rescheduleSlots.length === 0 ? (
                        <div style={{ padding: '8px', fontSize: '0.82rem', color: 'var(--urgency-med-text)' }}>No slots available for this date.</div>
                      ) : (
                        <select
                          className="form-select"
                          value={newRescheduleTime}
                          onChange={(e) => setNewRescheduleTime(e.target.value)}
                          required
                        >
                          {rescheduleSlots.map((slot) => (
                            <option key={slot} value={slot}>{slot}</option>
                          ))}
                        </select>
                      )}
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '16px' }}>
                      <button type="button" className="btn btn-secondary" onClick={() => setReschedulingAppt(null)}>Cancel</button>
                      <button
                        type="submit"
                        className="btn btn-primary"
                        disabled={actionLoading || isRescheduleLeave || rescheduleSlots.length === 0}
                      >
                        {actionLoading ? 'Rescheduling...' : 'Confirm Reschedule'}
                      </button>
                    </div>
                  </form>
                </div>
              </div>
            )}

            {/* Patient Post-Visit Clinical Summary Modal */}
            {selectedPostVisitAppt && selectedPostVisitAppt.postVisitSummary && (
              <div className="modal-overlay">
                <div className="modal-dialog">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', paddingBottom: '12px', borderBottom: '1px solid var(--border-light)' }}>
                    <div>
                      <h3 style={{ fontSize: '1.15rem', fontWeight: 700, color: 'var(--text-main)' }}>
                        Clinical Visit Summary & Care Plan
                      </h3>
                      <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                        Consultation Date: {new Date(selectedPostVisitAppt.date).toLocaleDateString()} at {selectedPostVisitAppt.timeSlot}
                      </div>
                    </div>
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      onClick={() => setSelectedPostVisitAppt(null)}
                    >
                      ✕ Close
                    </button>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                    {/* Attending Doctor Info */}
                    <div style={{ background: 'var(--bg-subtle)', padding: '12px 14px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-light)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div>
                        <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>Attending Doctor</span>
                        <div style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--text-main)' }}>
                          {selectedPostVisitAppt.doctor?.user?.name || 'Specialist Doctor'}
                        </div>
                        <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                          {selectedPostVisitAppt.doctor?.specialization || 'Healthcare'} • {selectedPostVisitAppt.doctor?.user?.email}
                        </span>
                      </div>
                      <span className="status-pill status-completed">Completed</span>
                    </div>

                    {/* 1. Visit Summary */}
                    <div>
                      <span style={{ fontSize: '0.74rem', color: 'var(--primary)', textTransform: 'uppercase', fontWeight: 700, display: 'block', marginBottom: '4px' }}>
                        1. Visit Summary
                      </span>
                      <p style={{ background: '#ffffff', padding: '12px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-light)', fontSize: '0.88rem', lineHeight: 1.5, color: 'var(--text-main)' }}>
                        {selectedPostVisitAppt.postVisitSummary?.patientSummary || 'No summary notes.'}
                      </p>
                    </div>

                    {/* 2. Medication Schedule */}
                    <div>
                      <span style={{ fontSize: '0.74rem', color: 'var(--accent)', textTransform: 'uppercase', fontWeight: 700, display: 'block', marginBottom: '4px' }}>
                        2. Medication Schedule & Prescriptions
                      </span>
                      <pre style={{ background: 'var(--accent-subtle)', padding: '12px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--accent-border)', whiteSpace: 'pre-wrap', fontFamily: 'inherit', fontSize: '0.86rem', color: 'var(--urgency-low-text)', lineHeight: 1.5 }}>
                        {selectedPostVisitAppt.postVisitSummary?.medicationSchedule || 'Follow advice provided during consultation.'}
                      </pre>
                    </div>

                    {/* 3. Follow-up Steps */}
                    <div>
                      <span style={{ fontSize: '0.74rem', color: 'var(--urgency-med-text)', textTransform: 'uppercase', fontWeight: 700, display: 'block', marginBottom: '4px' }}>
                        3. Follow-Up Steps & Instructions
                      </span>
                      <p style={{ background: 'var(--urgency-med-bg)', padding: '12px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--urgency-med-border)', fontSize: '0.86rem', color: 'var(--urgency-med-text)', lineHeight: 1.5 }}>
                        {selectedPostVisitAppt.postVisitSummary?.followUpSteps || 'Follow up with clinic if symptoms persist.'}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ========================================================= */}
        {/* 2. DOCTOR PORTAL */}
        {/* ========================================================= */}
        {currentUser.role === 'doctor' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            {/* Top Workspace Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '16px' }}>
              <div>
                <h2 style={{ fontSize: '1.4rem', fontWeight: 700, color: 'var(--text-main)', letterSpacing: '-0.02em' }}>
                  Doctor Workspace — Dr. {currentUser.name}
                </h2>
                <p style={{ color: 'var(--text-muted)', fontSize: '0.86rem' }}>
                  Patient consultation schedule, pre-visit triage, and post-visit clinical documentation.
                </p>
              </div>

              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() => setShowLeaveModal(true)}
                >
                  Schedule Leave Day
                </button>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={fetchDoctorAppointments}
                  disabled={loadingAppointments}
                >
                  Refresh Queue
                </button>
              </div>
            </div>

            {/* Patient Queue Data Table */}
            <div className="card-panel">
              <div className="card-panel-header">
                <div>
                  <h3 className="card-title">Assigned Patient Queue</h3>
                  <p className="card-subtitle">{doctorAppointments.length} consultation(s) on your schedule.</p>
                </div>
                <span className="ai-clinical-badge">Clinical Workspace</span>
              </div>

              {loadingAppointments ? (
                <p style={{ color: 'var(--text-muted)', fontSize: '0.86rem' }}>Loading schedule from clinic database...</p>
              ) : doctorAppointments.length === 0 ? (
                <p style={{ color: 'var(--text-muted)', fontSize: '0.86rem', fontStyle: 'italic' }}>
                  No consultations currently assigned.
                </p>
              ) : (
                <div className="data-table-wrapper">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Patient Name & Email</th>
                        <th>Slot Time</th>
                        <th>Reported Symptoms</th>
                        <th>AI Triage Urgency</th>
                        <th>Suggested Question</th>
                        <th>Status</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {doctorAppointments.map((appt) => (
                        <tr key={appt._id}>
                          <td>
                            <strong>{appt.patient?.name || 'Patient'}</strong>
                            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{appt.patient?.email}</div>
                          </td>
                          <td>
                            <div>{new Date(appt.date).toLocaleDateString()}</div>
                            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontVariantNumeric: 'tabular-nums' }}>
                              {appt.timeSlot}
                            </div>
                          </td>
                          <td style={{ maxWidth: '180px' }}>
                            <div style={{ fontSize: '0.82rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                              {appt.symptoms}
                            </div>
                          </td>
                          <td>
                            <span className={appt.preVisitSummary?.urgencyLevel === 'High' ? 'urgency-badge-high status-pill' : appt.preVisitSummary?.urgencyLevel === 'Medium' ? 'urgency-badge-medium status-pill' : 'urgency-badge-low status-pill'}>
                              {appt.preVisitSummary?.urgencyLevel || 'Routine'}
                            </span>
                          </td>
                          <td style={{ maxWidth: '200px' }}>
                            <div style={{ fontSize: '0.78rem', color: 'var(--text-body)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                              {appt.preVisitSummary?.suggestedQuestions?.[0] || 'Standard intake review'}
                            </div>
                          </td>
                          <td>
                            <span className={`status-pill ${appt.status === 'Completed' ? 'status-completed' : appt.status === 'Cancelled' ? 'status-cancelled' : 'status-scheduled'}`}>
                              {appt.status}
                            </span>
                          </td>
                          <td>
                            <button
                              type="button"
                              className={`btn btn-sm ${appt.status === 'Completed' ? 'btn-secondary' : 'btn-primary'}`}
                              onClick={() => {
                                setConsultingAppt(appt);
                                setClinicalNotes(appt.postVisitSummary?.clinicalNotes || '');
                              }}
                            >
                              {appt.status === 'Completed' ? 'View Notes' : 'Start Consultation'}
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Active Consultation Workspace Modal */}
            {consultingAppt && (
              <div className="modal-overlay">
                <div className="modal-dialog" style={{ maxWidth: '780px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', paddingBottom: '12px', borderBottom: '1px solid var(--border-light)' }}>
                    <div>
                      <h3 style={{ fontSize: '1.15rem', fontWeight: 700, color: 'var(--text-main)' }}>
                        Consultation: {consultingAppt.patient?.name}
                      </h3>
                      <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                        Time Slot: {consultingAppt.timeSlot} • Date: {new Date(consultingAppt.date).toLocaleDateString()}
                      </div>
                    </div>
                    <button type="button" className="btn btn-secondary btn-sm" onClick={() => setConsultingAppt(null)}>✕ Close</button>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1.1fr 0.9fr', gap: '16px' }}>
                    <div>
                      {/* AI Pre-Visit Reference Card */}
                      <div style={{ background: 'var(--bg-subtle)', padding: '10px 12px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-light)', marginBottom: '12px' }}>
                        <span style={{ fontSize: '0.72rem', color: 'var(--primary)', fontWeight: 700, textTransform: 'uppercase' }}>
                          AI Pre-Visit Intake Summary
                        </span>
                        <div style={{ fontSize: '0.82rem', marginTop: '4px' }}>
                          <strong>Chief Complaint:</strong> {consultingAppt.preVisitSummary?.chiefComplaint || consultingAppt.symptoms}
                        </div>
                        {consultingAppt.preVisitSummary?.suggestedQuestions && (
                          <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: '4px' }}>
                            <strong>Suggested Q:</strong> {consultingAppt.preVisitSummary.suggestedQuestions[0]}
                          </div>
                        )}
                      </div>

                      <div className="form-group">
                        <label className="form-label">Doctor Clinical Notes & Prescriptions</label>
                        <textarea
                          className="form-textarea"
                          rows={6}
                          value={clinicalNotes}
                          onChange={(e) => setClinicalNotes(e.target.value)}
                          placeholder="Enter diagnosis, prescribed medication regimen (e.g. Amoxicillin 500mg BD x 5 days), and follow-up precautions..."
                        />
                      </div>

                      <button
                        type="button"
                        className="btn btn-primary btn-sm"
                        onClick={handleDoctorSubmitPostVisit}
                        disabled={consultationLoading}
                      >
                        {consultationLoading ? 'Generating AI Patient Summary...' : 'Save Notes & Generate Care Plan'}
                      </button>
                    </div>

                    <div>
                      <span style={{ fontSize: '0.74rem', color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase', display: 'block', marginBottom: '6px' }}>
                        Generated Patient-Friendly Care Plan
                      </span>

                      {consultingAppt.postVisitSummary?.patientSummary ? (
                        <div style={{ background: 'var(--bg-subtle)', padding: '12px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-light)', fontSize: '0.82rem', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                          <div>
                            <strong style={{ color: 'var(--primary)' }}>Patient Summary:</strong>
                            <p style={{ marginTop: '2px' }}>{consultingAppt.postVisitSummary.patientSummary}</p>
                          </div>
                          <div>
                            <strong style={{ color: 'var(--accent)' }}>Medication Schedule:</strong>
                            <pre style={{ whiteSpace: 'pre-wrap', marginTop: '2px', fontFamily: 'inherit' }}>
                              {consultingAppt.postVisitSummary.medicationSchedule}
                            </pre>
                          </div>
                          <div>
                            <strong style={{ color: 'var(--urgency-med-text)' }}>Follow-Up:</strong>
                            <p style={{ marginTop: '2px' }}>{consultingAppt.postVisitSummary.followUpSteps}</p>
                          </div>
                        </div>
                      ) : (
                        <div style={{ background: 'var(--bg-subtle)', padding: '24px 12px', borderRadius: 'var(--radius-sm)', border: '1px dashed var(--border-medium)', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.8rem' }}>
                          Enter clinical notes on the left and click save to run Gemini LLM translation into a patient-friendly care plan.
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Leave Scheduling Modal */}
            {showLeaveModal && (
              <div className="modal-overlay">
                <div className="modal-dialog">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                    <h3 style={{ fontSize: '1.1rem', fontWeight: 600 }}>Schedule Doctor Leave Day</h3>
                    <button type="button" className="btn btn-secondary btn-sm" onClick={() => setShowLeaveModal(false)}>✕</button>
                  </div>

                  <form onSubmit={handleDoctorLeaveSubmit}>
                    <div className="form-group">
                      <label className="form-label">Leave Date</label>
                      <input
                        type="date"
                        required
                        className="form-input"
                        value={leaveDate}
                        onChange={(e) => setLeaveDate(e.target.value)}
                      />
                    </div>

                    <div className="form-group">
                      <label className="form-label">Reason / Note</label>
                      <input
                        type="text"
                        placeholder="e.g. Medical Conference / Personal Leave"
                        className="form-input"
                        value={leaveReason}
                        onChange={(e) => setLeaveReason(e.target.value)}
                      />
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '16px' }}>
                      <button type="button" className="btn btn-secondary" onClick={() => setShowLeaveModal(false)}>Cancel</button>
                      <button type="submit" className="btn btn-primary" disabled={leaveLoading}>
                        {leaveLoading ? 'Registering...' : 'Register Leave & Notify Patients'}
                      </button>
                    </div>
                  </form>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ========================================================= */}
        {/* 3. ADMIN PORTAL */}
        {/* ========================================================= */}
        {currentUser.role === 'admin' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            {/* Top Operations Header */}
            <div>
              <h2 style={{ fontSize: '1.4rem', fontWeight: 700, color: 'var(--text-main)', letterSpacing: '-0.02em' }}>
                Clinic Operations & Doctor Management
              </h2>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.86rem' }}>
                Configure doctor profiles, working hours, consultation duration, and leave schedules.
              </p>
            </div>

            {/* Top Operations KPI Metrics Cards */}
            <div className="grid-4col">
              <div className="stat-metric-card">
                <span className="stat-metric-label">Active Doctors</span>
                <span className="stat-metric-value">{adminDoctors.length}</span>
                <span style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>Registered in database</span>
              </div>
              <div className="stat-metric-card">
                <span className="stat-metric-label">Total Appointments</span>
                <span className="stat-metric-value">{adminAppointments.length}</span>
                <span style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>Across all doctors</span>
              </div>
              <div className="stat-metric-card">
                <span className="stat-metric-label">Slot Duration</span>
                <span className="stat-metric-value">30m</span>
                <span style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>Configurable interval</span>
              </div>
              <div className="stat-metric-card">
                <span className="stat-metric-label">Recorded Leaves</span>
                <span className="stat-metric-value">
                  {adminDoctors.reduce((acc, d) => acc + (d.leaveDays?.length || 0), 0)}
                </span>
                <span style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>Leave days registered</span>
              </div>
            </div>

            {/* Doctor Management Table Panel */}
            <div className="card-panel">
              <div className="card-panel-header">
                <div>
                  <h3 className="card-title">Specialist Profiles & Availability</h3>
                  <p className="card-subtitle">Manage clinical working hours and slot durations.</p>
                </div>

                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                  <select
                    className="form-select"
                    style={{ width: 'auto', padding: '6px 10px', fontSize: '0.82rem' }}
                    value={adminSpecFilter}
                    onChange={(e) => {
                      setAdminSpecFilter(e.target.value);
                      fetchAdminData(e.target.value);
                    }}
                  >
                    <option value="All">All Specializations</option>
                    <option value="Cardiology">Cardiology</option>
                    <option value="Neurology">Neurology</option>
                    <option value="General Medicine">General Medicine</option>
                    <option value="Dermatology">Dermatology</option>
                    <option value="Orthopedics">Orthopedics</option>
                  </select>

                  <button
                    type="button"
                    className="btn btn-primary btn-sm"
                    onClick={() => setShowAddDoctorModal(true)}
                  >
                    + Add Doctor Profile
                  </button>
                </div>
              </div>

              {loadingDoctors ? (
                <p style={{ color: 'var(--text-muted)', fontSize: '0.86rem' }}>Loading doctor profiles from database...</p>
              ) : adminDoctors.length === 0 ? (
                <p style={{ color: 'var(--text-muted)', fontSize: '0.86rem', fontStyle: 'italic' }}>
                  No doctors registered for this specialization.
                </p>
              ) : (
                <div className="data-table-wrapper">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Doctor Name & Email</th>
                        <th>Specialization</th>
                        <th>Working Hours</th>
                        <th>Slot Duration</th>
                        <th>Registered Leaves</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {adminDoctors.map((doc) => (
                        <tr key={doc._id}>
                          <td>
                            <strong>{doc.user?.name || 'Doctor'}</strong>
                            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{doc.user?.email}</div>
                          </td>
                          <td>
                            <span style={{ background: 'var(--bg-subtle)', border: '1px solid var(--border-light)', padding: '2px 8px', borderRadius: '4px', fontSize: '0.76rem', fontWeight: 600 }}>
                              {doc.specialization}
                            </span>
                          </td>
                          <td style={{ fontVariantNumeric: 'tabular-nums' }}>
                            {doc.workingHours?.start} – {doc.workingHours?.end}
                          </td>
                          <td>
                            <strong>{doc.slotDuration}</strong> mins
                          </td>
                          <td>
                            {doc.leaveDays && doc.leaveDays.length > 0 ? (
                              <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                                {doc.leaveDays.map((d, i) => (
                                  <span key={i} className="status-pill status-cancelled">
                                    {new Date(d.date || d).toLocaleDateString()}
                                  </span>
                                ))}
                              </div>
                            ) : (
                              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>None</span>
                            )}
                          </td>
                          <td>
                            <div style={{ display: 'flex', gap: '6px' }}>
                              <button
                                type="button"
                                className="btn btn-secondary btn-sm"
                                onClick={() => setEditingDoctor(doc)}
                              >
                                Edit
                              </button>
                              <button
                                type="button"
                                className="btn btn-danger btn-sm"
                                onClick={() => handleAdminDeleteDoctor(doc._id, doc.user?.name || 'Doctor')}
                                disabled={adminActionLoading}
                              >
                                Delete
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Add Doctor Modal */}
            {showAddDoctorModal && (
              <div className="modal-overlay">
                <div className="modal-dialog">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                    <h3 style={{ fontSize: '1.1rem', fontWeight: 600 }}>Add Specialist Doctor Profile</h3>
                    <button type="button" className="btn btn-secondary btn-sm" onClick={() => setShowAddDoctorModal(false)}>✕</button>
                  </div>

                  <form onSubmit={handleAdminCreateDoctor}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                      <div className="form-group">
                        <label className="form-label">Full Name</label>
                        <input
                          type="text"
                          required
                          placeholder="e.g. Dr. Robert House"
                          className="form-input"
                          value={newDoctorForm.name}
                          onChange={(e) => setNewDoctorForm({ ...newDoctorForm, name: e.target.value })}
                        />
                      </div>
                      <div className="form-group">
                        <label className="form-label">Email Address</label>
                        <input
                          type="email"
                          required
                          placeholder="robert.house@clinic.com"
                          className="form-input"
                          value={newDoctorForm.email}
                          onChange={(e) => setNewDoctorForm({ ...newDoctorForm, email: e.target.value })}
                        />
                      </div>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                      <div className="form-group">
                        <label className="form-label">Specialization</label>
                        <select
                          className="form-select"
                          value={newDoctorForm.specialization}
                          onChange={(e) => setNewDoctorForm({ ...newDoctorForm, specialization: e.target.value })}
                        >
                          <option>Cardiology</option>
                          <option>Neurology</option>
                          <option>General Medicine</option>
                          <option>Dermatology</option>
                          <option>Orthopedics</option>
                          <option>Pediatrics</option>
                        </select>
                      </div>
                      <div className="form-group">
                        <label className="form-label">Slot Duration (Mins)</label>
                        <select
                          className="form-select"
                          value={newDoctorForm.slotDuration}
                          onChange={(e) => setNewDoctorForm({ ...newDoctorForm, slotDuration: e.target.value })}
                        >
                          <option value="15">15 Minutes</option>
                          <option value="20">20 Minutes</option>
                          <option value="30">30 Minutes</option>
                          <option value="45">45 Minutes</option>
                          <option value="60">60 Minutes</option>
                        </select>
                      </div>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                      <div className="form-group">
                        <label className="form-label">Start Time (HH:MM)</label>
                        <input
                          type="text"
                          className="form-input"
                          value={newDoctorForm.startTime}
                          onChange={(e) => setNewDoctorForm({ ...newDoctorForm, startTime: e.target.value })}
                        />
                      </div>
                      <div className="form-group">
                        <label className="form-label">End Time (HH:MM)</label>
                        <input
                          type="text"
                          className="form-input"
                          value={newDoctorForm.endTime}
                          onChange={(e) => setNewDoctorForm({ ...newDoctorForm, endTime: e.target.value })}
                        />
                      </div>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '16px' }}>
                      <button type="button" className="btn btn-secondary" onClick={() => setShowAddDoctorModal(false)}>Cancel</button>
                      <button type="submit" className="btn btn-primary" disabled={adminActionLoading}>
                        {adminActionLoading ? 'Saving...' : 'Save Profile'}
                      </button>
                    </div>
                  </form>
                </div>
              </div>
            )}

            {/* Edit Doctor Modal */}
            {editingDoctor && (
              <div className="modal-overlay">
                <div className="modal-dialog">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                    <h3 style={{ fontSize: '1.1rem', fontWeight: 600 }}>Edit Doctor Profile: {editingDoctor.user?.name}</h3>
                    <button type="button" className="btn btn-secondary btn-sm" onClick={() => setEditingDoctor(null)}>✕</button>
                  </div>

                  <form onSubmit={handleAdminUpdateDoctor}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                      <div className="form-group">
                        <label className="form-label">Specialization</label>
                        <input
                          type="text"
                          className="form-input"
                          value={editingDoctor.specialization}
                          onChange={(e) => setEditingDoctor({ ...editingDoctor, specialization: e.target.value })}
                        />
                      </div>
                      <div className="form-group">
                        <label className="form-label">Slot Duration (Mins)</label>
                        <input
                          type="number"
                          className="form-input"
                          value={editingDoctor.slotDuration}
                          onChange={(e) => setEditingDoctor({ ...editingDoctor, slotDuration: Number(e.target.value) })}
                        />
                      </div>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                      <div className="form-group">
                        <label className="form-label">Start Time (HH:MM)</label>
                        <input
                          type="text"
                          className="form-input"
                          value={editingDoctor.workingHours?.start}
                          onChange={(e) => setEditingDoctor({
                            ...editingDoctor,
                            workingHours: { ...editingDoctor.workingHours, start: e.target.value }
                          })}
                        />
                      </div>
                      <div className="form-group">
                        <label className="form-label">End Time (HH:MM)</label>
                        <input
                          type="text"
                          className="form-input"
                          value={editingDoctor.workingHours?.end}
                          onChange={(e) => setEditingDoctor({
                            ...editingDoctor,
                            workingHours: { ...editingDoctor.workingHours, end: e.target.value }
                          })}
                        />
                      </div>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '16px' }}>
                      <button type="button" className="btn btn-secondary" onClick={() => setEditingDoctor(null)}>Cancel</button>
                      <button type="submit" className="btn btn-primary" disabled={adminActionLoading}>
                        {adminActionLoading ? 'Updating...' : 'Update Profile'}
                      </button>
                    </div>
                  </form>
                </div>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
