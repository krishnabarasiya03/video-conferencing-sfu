import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import HomeScreen from './components/HomeScreen';
import HostMeetingManager from './components/HostMeetingManager';
import ParticipantMeetingList from './components/ParticipantMeetingList';
import MeetingRoom from './components/MeetingRoom';
import './App.css';

function App() {
  return (
    <Router>
      <div className="App">
        <Routes>
          <Route path="/" element={<HomeScreen />} />
          <Route path="/host" element={<HostMeetingManager />} />
          <Route path="/participant" element={<ParticipantMeetingList />} />
          <Route path="/meeting/:meetingCode" element={<MeetingRoom />} />
        </Routes>
      </div>
    </Router>
  );
}

export default App;
