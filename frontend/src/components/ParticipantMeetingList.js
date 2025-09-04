import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { meetingAPI } from '../services/api';

const ParticipantMeetingList = () => {
  const [meetings, setMeetings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const navigate = useNavigate();

  const userName = localStorage.getItem('userName');
  const meetingCode = localStorage.getItem('meetingCode');

  useEffect(() => {
    if (!userName) {
      navigate('/');
      return;
    }

    const checkSpecificMeeting = async () => {
      try {
        const meetingData = await meetingAPI.getMeeting(meetingCode);
        // If meeting exists, show it in the list
        setMeetings([meetingData]);
      } catch (error) {
        setError(`Meeting with code "${meetingCode}" not found or has ended.`);
        // Still load other meetings
        loadMeetings();
      } finally {
        setLoading(false);
      }
    };

    // If a specific meeting code was provided, try to join directly
    if (meetingCode) {
      checkSpecificMeeting();
    } else {
      loadMeetings();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userName, meetingCode, navigate]);



  const loadMeetings = async () => {
    try {
      const meetingList = await meetingAPI.getScheduledMeetings();
      setMeetings(meetingList);
    } catch (error) {
      setError(error.error || 'Failed to load meetings');
    } finally {
      setLoading(false);
    }
  };

  const handleJoinMeeting = (meeting) => {
    const now = new Date();
    const scheduledTime = new Date(meeting.scheduledTime);
    
    // Allow joining 5 minutes before scheduled time
    const allowedJoinTime = new Date(scheduledTime.getTime() - 5 * 60 * 1000);
    
    if (now < allowedJoinTime) {
      const timeDiff = scheduledTime.getTime() - now.getTime();
      const minutesLeft = Math.ceil(timeDiff / (1000 * 60));
      alert(`Meeting starts in ${minutesLeft} minutes. You can join 5 minutes before the scheduled time.`);
      return;
    }

    // Store meeting info and navigate to meeting room
    localStorage.setItem('meetingCode', meeting.meetingCode);
    localStorage.setItem('isHost', 'false');
    navigate(`/meeting/${meeting.meetingCode}`);
  };

  const handleBackToHome = () => {
    localStorage.removeItem('userName');
    localStorage.removeItem('meetingCode');
    navigate('/');
  };

  const formatDateTime = (dateString) => {
    return new Date(dateString).toLocaleString();
  };

  const getMeetingStatus = (meeting) => {
    const now = new Date();
    const scheduledTime = new Date(meeting.scheduledTime);
    const endTime = new Date(scheduledTime.getTime() + meeting.duration * 60 * 1000);
    const allowedJoinTime = new Date(scheduledTime.getTime() - 5 * 60 * 1000);

    if (now < allowedJoinTime) {
      return { status: 'upcoming', color: '#718096' };
    } else if (now >= allowedJoinTime && now <= endTime) {
      return meeting.isActive 
        ? { status: 'live', color: '#48bb78' }
        : { status: 'ready', color: '#4299e1' };
    } else {
      return { status: 'ended', color: '#e53e3e' };
    }
  };

  if (!userName) {
    return <div className="loading">Loading...</div>;
  }

  return (
    <div className="participant-container">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
        <h2>Available Meetings</h2>
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
        Welcome, <strong>{userName}</strong>! Select a meeting to join.
      </p>

      {error && (
        <div className="error-message">
          {error}
        </div>
      )}

      {loading ? (
        <div className="loading">Loading meetings...</div>
      ) : meetings.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '3rem', color: '#718096' }}>
          <h3>No meetings found</h3>
          <p>There are no scheduled meetings available at the moment.</p>
          <button 
            onClick={handleBackToHome}
            style={{
              marginTop: '1rem',
              padding: '0.75rem 1.5rem',
              background: '#667eea',
              color: 'white',
              border: 'none',
              borderRadius: '5px',
              cursor: 'pointer'
            }}
          >
            Go Back to Home
          </button>
        </div>
      ) : (
        <div className="meeting-list">
          {meetings.map((meeting) => {
            const status = getMeetingStatus(meeting);
            const canJoin = status.status === 'ready' || status.status === 'live';
            
            return (
              <div key={meeting.meetingCode} className="meeting-card">
                <div className="meeting-info">
                  <div className="meeting-details">
                    <h3>{meeting.title}</h3>
                    <p><strong>Host:</strong> {meeting.hostName}</p>
                    <p><strong>Meeting Code:</strong> {meeting.meetingCode}</p>
                    <p><strong>Scheduled:</strong> {formatDateTime(meeting.scheduledTime)}</p>
                    <p><strong>Duration:</strong> {meeting.duration} minutes</p>
                    <p style={{ color: status.color, fontWeight: 'bold' }}>
                      Status: {status.status.charAt(0).toUpperCase() + status.status.slice(1)}
                      {status.status === 'live' && ' 🔴'}
                    </p>
                  </div>
                  <div>
                    <button
                      className="join-button"
                      onClick={() => handleJoinMeeting(meeting)}
                      disabled={!canJoin}
                      style={{
                        opacity: canJoin ? 1 : 0.5,
                        cursor: canJoin ? 'pointer' : 'not-allowed'
                      }}
                    >
                      {status.status === 'live' ? 'Join Live' : 
                       status.status === 'ready' ? 'Join Meeting' : 
                       status.status === 'upcoming' ? 'Not Started' : 'Ended'}
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div style={{ marginTop: '2rem', textAlign: 'center' }}>
        <button
          onClick={loadMeetings}
          style={{
            background: 'none',
            border: '1px solid #667eea',
            color: '#667eea',
            padding: '0.75rem 1.5rem',
            borderRadius: '5px',
            cursor: 'pointer'
          }}
        >
          🔄 Refresh Meetings
        </button>
      </div>
    </div>
  );
};

export default ParticipantMeetingList;