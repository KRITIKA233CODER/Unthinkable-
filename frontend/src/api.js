/**
 * Centralized API Client for HealthPulse AI
 * Handles JWT authentication headers, request formatting, and status code handling.
 */

const API_BASE = import.meta.env.VITE_API_URL 
  ? `${import.meta.env.VITE_API_URL.replace(/\/$/, '')}/api` 
  : '/api';

export const getStoredToken = () => localStorage.getItem('token');
export const getStoredUser = () => {
  try {
    const raw = localStorage.getItem('user');
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
};

export const setSession = (token, user) => {
  if (token) localStorage.setItem('token', token);
  if (user) localStorage.setItem('user', JSON.stringify(user));
};

export const clearSession = () => {
  localStorage.removeItem('token');
  localStorage.removeItem('user');
};

/**
 * Generic fetch wrapper
 */
async function request(endpoint, options = {}) {
  const token = getStoredToken();
  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {})
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const config = {
    ...options,
    headers
  };

  let response;
  try {
    response = await fetch(`${API_BASE}${endpoint}`, config);
  } catch (netErr) {
    throw new Error('Network error: Unable to connect to server. Please ensure backend is running.');
  }

  let data;
  const contentType = response.headers.get('content-type');
  if (contentType && contentType.includes('application/json')) {
    data = await response.json();
  } else {
    data = { message: await response.text() };
  }

  if (!response.ok) {
    if (response.status === 401) {
      clearSession();
      const err = new Error(data.message || 'Session expired or unauthorized. Please log in again.');
      err.status = 401;
      throw err;
    } else if (response.status === 403) {
      const err = new Error(data.message || 'Access denied: You do not have permission for this action.');
      err.status = 403;
      throw err;
    } else if (response.status === 409) {
      const err = new Error(data.message || 'Conflict: This slot or resource is already taken.');
      err.status = 409;
      throw err;
    } else {
      const err = new Error(data.message || `Server error (${response.status})`);
      err.status = response.status;
      throw err;
    }
  }

  return data;
}

// -------------------------------------------------------------
// Authentication Endpoints
// -------------------------------------------------------------
export const api = {
  // Auth
  register: (name, email, password, role = 'patient') =>
    request('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ name, email, password, role })
    }),

  login: (email, password) =>
    request('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password })
    }),

  getMe: () => request('/auth/me'),

  // Doctors
  getDoctors: (specialization = '') => {
    const query = specialization && specialization !== 'All'
      ? `?specialization=${encodeURIComponent(specialization)}`
      : '';
    return request(`/doctors${query}`);
  },

  getAvailableSlots: (doctorId, date) =>
    request(`/doctors/${doctorId}/available-slots?date=${encodeURIComponent(date)}`),

  createDoctor: (doctorData) =>
    request('/doctors', {
      method: 'POST',
      body: JSON.stringify(doctorData)
    }),

  updateDoctor: (id, doctorData) =>
    request(`/doctors/${id}`, {
      method: 'PUT',
      body: JSON.stringify(doctorData)
    }),

  deleteDoctor: (id) =>
    request(`/doctors/${id}`, {
      method: 'DELETE'
    }),

  markDoctorLeave: (date, reason = '') =>
    request('/doctors/leave', {
      method: 'POST',
      body: JSON.stringify({ date, reason })
    }),

  // Appointments
  holdSlot: (holdData) =>
    request('/appointments/hold', {
      method: 'POST',
      body: JSON.stringify(holdData)
    }),

  bookAppointment: (appointmentData) =>
    request('/appointments/book', {
      method: 'POST',
      body: JSON.stringify(appointmentData)
    }),

  getMyAppointments: () => request('/appointments/my'),

  cancelAppointment: (id) =>
    request(`/appointments/${id}/cancel`, {
      method: 'PUT'
    }),

  rescheduleAppointment: (id, date, timeSlot) =>
    request(`/appointments/${id}/reschedule`, {
      method: 'PUT',
      body: JSON.stringify({ date, timeSlot })
    }),

  submitPostVisit: (id, clinicalNotes) =>
    request(`/appointments/${id}/post-visit`, {
      method: 'POST',
      body: JSON.stringify({ clinicalNotes })
    })
};
