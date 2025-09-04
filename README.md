# Video Conferencing SFU

A real-time video conferencing application built with Node.js, Express, Socket.IO, and WebRTC. This application allows users to host meetings with unique codes and enables participants to join using the same meeting code.

## Features

- 🎥 **Real-time Video Conferencing** - WebRTC-based peer-to-peer video communication
- 🔢 **Meeting Codes** - 6-digit unique codes for easy meeting access
- 👥 **Host & Participant Roles** - Dedicated interfaces for hosts and participants
- 📱 **Responsive Design** - Works on desktop and mobile devices
- 🎤 **Media Controls** - Toggle camera and microphone on/off
- 👋 **Real-time Participant Management** - See who joins and leaves the meeting

## Screenshots

### Main Landing Page
![Main Page](https://github.com/user-attachments/assets/c2412483-2c04-4327-a0ce-1356ad502f14)

### Host Screen with Meeting Code
![Host Page](https://github.com/user-attachments/assets/a2d6e3f4-c65e-4c5d-830a-f6c5dcd6c196)

### Participant Screen
![Participant Page](https://github.com/user-attachments/assets/93e8859e-aa15-4a40-8e46-66b4322a54d0)

## Quick Start

### Prerequisites
- Node.js (v14 or higher)
- npm

### Installation

1. Clone the repository:
```bash
git clone https://github.com/krishnabarasiya03/video-conferencing-sfu.git
cd video-conferencing-sfu
```

2. Install dependencies:
```bash
cd backend
npm install
```

3. Start the server:
```bash
npm start
```

4. Open your browser and navigate to:
```
http://localhost:3000
```

### Development Mode

To run in development mode with auto-restart:
```bash
npm run dev
```

## How It Works

### For Hosts:
1. Click "Host Meeting" on the main page
2. A unique 6-digit meeting code is automatically generated
3. Share this code with participants
4. Click "Start Meeting" to begin the video conference

### For Participants:
1. Click "Join Meeting" on the main page
2. Enter the 6-digit meeting code provided by the host
3. Enter your name
4. Click "Join Meeting" to join the video conference

## Technical Architecture

### Backend
- **Express.js** - Web server framework
- **Socket.IO** - Real-time bidirectional communication
- **Meeting Management** - In-memory storage for meeting rooms and codes
- **WebRTC Signaling** - Handles offer/answer exchange and ICE candidates

### Frontend
- **Vanilla JavaScript** - No framework dependencies for simplicity
- **WebRTC API** - Direct peer-to-peer video/audio streaming
- **Responsive CSS** - Modern UI with mobile support
- **Socket.IO Client** - Real-time communication with the server

### Key Components

1. **Meeting Code Generation** - Generates unique 6-digit codes for each meeting
2. **Room Management** - Tracks active meetings, hosts, and participants
3. **WebRTC Signaling** - Facilitates peer-to-peer connection establishment
4. **Media Controls** - Camera and microphone toggle functionality
5. **Participant Management** - Real-time updates when users join/leave

## API Endpoints

- `POST /api/meeting/create` - Create a new meeting and get a code
- `POST /api/meeting/join` - Validate and join an existing meeting
- `GET /api/meeting/:code` - Get meeting information by code

## Browser Compatibility

- Chrome 80+
- Firefox 75+
- Safari 13+
- Edge 80+

## Security Considerations

- Meeting codes expire when the host leaves
- Camera/microphone permissions required
- STUN servers used for NAT traversal
- All communication is encrypted via HTTPS/WSS in production

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## License

MIT License - see LICENSE file for details