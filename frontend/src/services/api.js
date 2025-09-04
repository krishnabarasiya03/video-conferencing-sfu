import axios from 'axios';

const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000';

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

export const meetingAPI = {
  // Create a new meeting
  createMeeting: async (meetingData) => {
    try {
      const response = await api.post('/api/meetings/create', meetingData);
      return response.data;
    } catch (error) {
      throw error.response?.data || { error: 'Failed to create meeting' };
    }
  },

  // Get meeting by code
  getMeeting: async (meetingCode) => {
    try {
      const response = await api.get(`/api/meetings/${meetingCode}`);
      return response.data;
    } catch (error) {
      throw error.response?.data || { error: 'Failed to fetch meeting' };
    }
  },

  // Get list of scheduled meetings for participants
  getScheduledMeetings: async () => {
    try {
      const response = await api.get('/api/meetings/participant/list');
      return response.data;
    } catch (error) {
      throw error.response?.data || { error: 'Failed to fetch meetings' };
    }
  },

  // Update meeting status
  updateMeetingStatus: async (meetingCode, status) => {
    try {
      const response = await api.patch(`/api/meetings/${meetingCode}/status`, status);
      return response.data;
    } catch (error) {
      throw error.response?.data || { error: 'Failed to update meeting status' };
    }
  },

  // Delete meeting
  deleteMeeting: async (meetingCode) => {
    try {
      const response = await api.delete(`/api/meetings/${meetingCode}`);
      return response.data;
    } catch (error) {
      throw error.response?.data || { error: 'Failed to delete meeting' };
    }
  },
};

export default api;