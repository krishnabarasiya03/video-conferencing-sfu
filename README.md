# Video Conferencing SFU Application

A complete video conferencing application built using the SFU (Selective Forwarding Unit) model with React.js frontend and Node.js backend.

## Features

- **Host/Participant Roles**: Users can join as either host or participant
- **Meeting Scheduling**: Hosts can schedule meetings for future times
- **SFU Streaming**: Only host streams video/audio, participants receive the stream
- **Real-time Chat**: All participants can send messages in the chat
- **Meeting Controls**: Host can mute/unmute audio/video, share screen, and end meetings
- **Meeting Codes**: Support for both string and integer meeting codes
- **Responsive Design**: Works on desktop and mobile devices

## Tech Stack

### Backend
- **Node.js** with Express.js
- **Socket.IO** for real-time communication
- **MediaSoup** for SFU streaming
- **MongoDB** with Mongoose for data storage
- **JWT** for authentication (if needed)

### Frontend
- **React.js** with React Router
- **Socket.IO Client** for real-time communication
- **MediaSoup Client** for WebRTC handling
- **Axios** for API calls

## Installation & Setup

### Prerequisites
- Node.js (v16 or higher)
- MongoDB (local or cloud instance)
- npm or yarn

### Backend Setup

1. Navigate to the backend directory:
```bash
cd backend
```

2. Install dependencies:
```bash
npm install
```

3. Create environment file (.env):
```bash
PORT=5000
CLIENT_URL=http://localhost:3000
MONGODB_URI=mongodb://localhost:27017/video-conferencing
JWT_SECRET=your-super-secret-jwt-key-change-this-in-production
NODE_ENV=development
```

4. Start MongoDB service (if running locally)

5. Start the backend server:
```bash
# Development mode
npm run dev

# Production mode
npm start
```

The backend server will start on http://localhost:5000

### Frontend Setup

1. Navigate to the frontend directory:
```bash
cd frontend
```

2. Install dependencies:
```bash
npm install
```

3. Create environment file (.env):
```bash
REACT_APP_API_URL=http://localhost:5000
REACT_APP_SOCKET_URL=http://localhost:5000
```

4. Start the frontend development server:
```bash
npm start
```

The frontend will be available at http://localhost:3000

## Usage Guide

### For Hosts

1. **Create Meeting**:
   - Go to the home page
   - Select "Host" role
   - Enter your name
   - Click "Continue"
   - Fill in meeting details (title, scheduled time, duration)
   - Click "Create Meeting"
   - Note down the generated meeting code

2. **Start Meeting**:
   - Click "Start Meeting Now" from the meeting creation page
   - Allow camera and microphone permissions
   - Use controls to mute/unmute audio/video
   - Share screen if needed
   - End meeting when done

### For Participants

1. **Join Meeting**:
   - Go to the home page
   - Select "Participate" role
   - Enter your name and meeting code
   - Click "Continue"
   - Select the meeting from the list
   - Click "Join Meeting" when it's time

2. **During Meeting**:
   - View the host's video stream
   - Send messages in the chat
   - Leave the meeting anytime

## API Endpoints

### Meetings
- `POST /api/meetings/create` - Create a new meeting
- `GET /api/meetings/:code` - Get meeting by code
- `GET /api/meetings/participant/list` - Get scheduled meetings
- `PATCH /api/meetings/:code/status` - Update meeting status
- `DELETE /api/meetings/:code` - Delete meeting

### Health Check
- `GET /health` - Server health check

## Socket Events

### Client to Server
- `join-meeting` - Join a meeting room
- `send-message` - Send chat message
- `toggle-audio` - Toggle host audio
- `toggle-video` - Toggle host video
- `end-meeting` - End meeting (host only)
- `create-transport` - Create MediaSoup transport
- `connect-transport` - Connect MediaSoup transport
- `create-producer` - Create media producer
- `create-consumer` - Create media consumer
- `resume-consumer` - Resume media consumer

### Server to Client
- `joined-meeting` - Meeting join confirmation
- `participant-joined` - New participant joined
- `participant-left` - Participant left
- `new-message` - New chat message
- `meeting-ended` - Meeting ended
- `host-audio-toggled` - Host audio status changed
- `host-video-toggled` - Host video status changed
- `new-producer` - New media producer available
- `transport-created` - Transport creation response
- `transport-connected` - Transport connection response
- `producer-created` - Producer creation response
- `consumer-created` - Consumer creation response
- `consumer-resumed` - Consumer resume response
- `error` - Error occurred

## Project Structure

```
video-conferencing-sfu/
├── backend/
│   ├── models/
│   │   └── Meeting.js
│   ├── routes/
│   │   └── meetings.js
│   ├── services/
│   │   └── mediasoupManager.js
│   ├── socket/
│   │   └── socketHandler.js
│   ├── server.js
│   ├── package.json
│   └── .env
├── frontend/
│   ├── public/
│   ├── src/
│   │   ├── components/
│   │   │   ├── HomeScreen.js
│   │   │   ├── HostMeetingManager.js
│   │   │   ├── ParticipantMeetingList.js
│   │   │   └── MeetingRoom.js
│   │   ├── services/
│   │   │   ├── api.js
│   │   │   ├── socketService.js
│   │   │   └── mediaSoupService.js
│   │   ├── App.js
│   │   ├── App.css
│   │   └── index.js
│   ├── package.json
│   └── .env
└── README.md
```

## Features Explained

### SFU (Selective Forwarding Unit) Model
- Only the host produces media (video/audio)
- Participants receive the host's stream without producing their own
- Efficient bandwidth usage and better scalability
- MediaSoup handles the media routing

### Meeting Lifecycle
1. Host creates and schedules a meeting
2. Participants can see scheduled meetings
3. Meetings can be joined 5 minutes before scheduled time
4. Host starts the meeting and begins streaming
5. Participants join and receive the stream
6. Chat is available throughout the meeting
7. Host can end the meeting for everyone

### Real-time Features
- Live participant count and list
- Real-time chat with timestamps
- Instant meeting status updates
- Host controls with immediate effect

## Development Notes

- The application uses MediaSoup v3 for WebRTC handling
- Socket.IO manages all real-time communication
- MongoDB stores meeting metadata and chat history
- The frontend is built with modern React hooks and functional components
- Responsive design works on various screen sizes

## Troubleshooting

1. **Connection Issues**: Check if MongoDB is running and accessible
2. **MediaSoup Errors**: Ensure ports 10000-10100 are available for RTC
3. **CORS Issues**: Verify CLIENT_URL matches frontend URL
4. **Camera/Mic Access**: Use HTTPS in production for media access
5. **Socket Connection**: Check firewall settings for WebSocket connections

## Security Considerations

- Change JWT_SECRET in production
- Use HTTPS in production
- Implement proper authentication if needed
- Validate all user inputs
- Set up proper CORS origins for production

## License

MIT License - see LICENSE file for details