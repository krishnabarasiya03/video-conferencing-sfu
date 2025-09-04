import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';

const HomeScreen = () => {
  const [selectedRole, setSelectedRole] = useState('');
  const [userName, setUserName] = useState('');
  const [meetingCode, setMeetingCode] = useState('');
  const navigate = useNavigate();

  const handleContinue = () => {
    if (!selectedRole || !userName) {
      alert('Please select a role and enter your name');
      return;
    }

    if (selectedRole === 'host') {
      // Store user name in localStorage for the host flow
      localStorage.setItem('userName', userName);
      navigate('/host');
    } else {
      // For participants, we need a meeting code
      if (!meetingCode) {
        alert('Please enter a meeting code');
        return;
      }
      localStorage.setItem('userName', userName);
      localStorage.setItem('meetingCode', meetingCode);
      navigate('/participant');
    }
  };

  return (
    <div className="home-screen">
      <h1 className="home-title">Video Conference</h1>
      
      <div className="role-selection">
        <button
          className={`role-button ${selectedRole === 'host' ? 'active' : ''}`}
          onClick={() => setSelectedRole('host')}
        >
          Host
        </button>
        <button
          className={`role-button ${selectedRole === 'participant' ? 'active' : ''}`}
          onClick={() => setSelectedRole('participant')}
        >
          Participate
        </button>
      </div>

      {selectedRole && (
        <>
          <div className="form-group">
            <label htmlFor="userName">Your Name</label>
            <input
              type="text"
              id="userName"
              value={userName}
              onChange={(e) => setUserName(e.target.value)}
              placeholder="Enter your name"
              maxLength={50}
            />
          </div>

          {selectedRole === 'participant' && (
            <div className="form-group">
              <label htmlFor="meetingCode">Meeting Code</label>
              <input
                type="text"
                id="meetingCode"
                value={meetingCode}
                onChange={(e) => setMeetingCode(e.target.value)}
                placeholder="Enter meeting code"
                maxLength={20}
              />
            </div>
          )}

          <button
            className="continue-button"
            onClick={handleContinue}
            disabled={!selectedRole || !userName || (selectedRole === 'participant' && !meetingCode)}
          >
            Continue
          </button>
        </>
      )}
    </div>
  );
};

export default HomeScreen;