import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { meetingAPI } from '../services/api';

const HostMeetingManager = () => {
  const [formData, setFormData] = useState({
    title: '',
    scheduledTime: '',
    duration: 60
  });
  const [createdMeeting, setCreatedMeeting] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const navigate = useNavigate();

  const hostName = localStorage.getItem('userName');

  useEffect(() => {
    if (!hostName) {
      navigate('/');
    }
  }, [hostName, navigate]);

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const handleCreateMeeting = async (e) => {
    e.preventDefault();
    
    if (!formData.title || !formData.scheduledTime) {
      setError('Please fill in all required fields');
      return;
    }

    // Check if scheduled time is in the future
    const scheduledDate = new Date(formData.scheduledTime);
    const now = new Date();
    if (scheduledDate <= now) {
      setError('Scheduled time must be in the future');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const meetingData = {
        hostName,
        title: formData.title,
        scheduledTime: formData.scheduledTime,
        duration: parseInt(formData.duration)
      };

      const response = await meetingAPI.createMeeting(meetingData);
      setCreatedMeeting(response.meeting);
    } catch (error) {
      setError(error.error || 'Failed to create meeting');
    } finally {
      setLoading(false);
    }
  };

  const handleStartMeeting = () => {
    if (createdMeeting) {
      // Store meeting code and navigate to meeting room
      localStorage.setItem('meetingCode', createdMeeting.meetingCode);
      localStorage.setItem('isHost', 'true');
      navigate(`/meeting/${createdMeeting.meetingCode}`);
    }
  };

  const handleBackToHome = () => {
    localStorage.removeItem('userName');
    navigate('/');
  };

  // Get minimum datetime for input (current time + 1 minute)
  const getMinDateTime = () => {
    const now = new Date();
    now.setMinutes(now.getMinutes() + 1);
    return now.toISOString().slice(0, 16);
  };

  if (!hostName) {
    return <div className="loading">Loading...</div>;
  }

  return (
    <div className="host-container">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
        <h2>Schedule Meeting</h2>
        <button 
          onClick={handleBackToHome}
          style={{ 
            background: 'none', 
            border: '1px solid #ddd', 
            padding: '0.5rem 1rem', 
            borderRadius: '5px',
            cursor: 'pointer'
          }}
        >
          ← Back to Home
        </button>
      </div>
      
      <p style={{ marginBottom: '2rem', color: '#666' }}>
        Welcome, <strong>{hostName}</strong>! Create and schedule your meeting.
      </p>

      {error && (
        <div className="error-message">
          {error}
        </div>
      )}

      {!createdMeeting ? (
        <form className="meeting-form" onSubmit={handleCreateMeeting}>
          <div className="form-group">
            <label htmlFor="title">Meeting Title *</label>
            <input
              type="text"
              id="title"
              name="title"
              value={formData.title}
              onChange={handleInputChange}
              placeholder="Enter meeting title"
              required
              maxLength={100}
            />
          </div>

          <div className="form-group">
            <label htmlFor="scheduledTime">Scheduled Time *</label>
            <input
              type="datetime-local"
              id="scheduledTime"
              name="scheduledTime"
              value={formData.scheduledTime}
              onChange={handleInputChange}
              min={getMinDateTime()}
              required
            />
          </div>

          <div className="form-group">
            <label htmlFor="duration">Duration (minutes)</label>
            <select
              id="duration"
              name="duration"
              value={formData.duration}
              onChange={handleInputChange}
            >
              <option value={30}>30 minutes</option>
              <option value={60}>1 hour</option>
              <option value={90}>1.5 hours</option>
              <option value={120}>2 hours</option>
              <option value={180}>3 hours</option>
            </select>
          </div>

          <button 
            type="submit" 
            className="create-button"
            disabled={loading}
          >
            {loading ? 'Creating Meeting...' : 'Create Meeting'}
          </button>
        </form>
      ) : (
        <div className="meeting-created">
          <h3>Meeting Created Successfully!</h3>
          <div className="meeting-code">{createdMeeting.meetingCode}</div>
          <p>Share this code with participants</p>
          <p><strong>Title:</strong> {createdMeeting.title}</p>
          <p><strong>Scheduled:</strong> {new Date(createdMeeting.scheduledTime).toLocaleString()}</p>
          <p><strong>Duration:</strong> {createdMeeting.duration} minutes</p>
          
          <button className="start-button" onClick={handleStartMeeting}>
            Start Meeting Now
          </button>
          
          <button 
            onClick={() => setCreatedMeeting(null)}
            style={{ 
              background: 'transparent', 
              border: '1px solid white', 
              color: 'white',
              padding: '1rem 2rem',
              borderRadius: '5px',
              marginTop: '1rem',
              marginLeft: '1rem',
              cursor: 'pointer'
            }}
          >
            Create Another Meeting
          </button>
        </div>
      )}
    </div>
  );
};

export default HostMeetingManager;