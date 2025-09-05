# Frontend - Video Conferencing SFU

This is the frontend component of the Video Conferencing SFU application.

## Structure

```
frontend/
├── public/          # Static HTML files
│   ├── index.html   # Main landing page
│   ├── host.html    # Host meeting interface
│   └── participant.html # Participant meeting interface
├── src/             # Source files
│   ├── css/         # Stylesheets
│   │   └── style.css
│   └── js/          # JavaScript files
│       ├── app.js      # Main application logic
│       ├── host.js     # Host-specific functionality
│       └── participant.js # Participant functionality
└── package.json     # Frontend dependencies and scripts
```

## Technology Stack

- **Vanilla JavaScript** - No framework dependencies for simplicity
- **WebRTC API** - Direct peer-to-peer video/audio streaming
- **Responsive CSS** - Modern UI with mobile support
- **Socket.IO Client** - Real-time communication with the server

## Development

The frontend is served by the backend Express server, so no separate development server is needed. However, you can run a standalone development server if needed:

```bash
npm install
npm run dev
```

This will start a development server on port 8080.

## Features

- 📱 **Responsive Design** - Works on desktop and mobile devices
- 🎥 **WebRTC Integration** - Real-time video/audio streaming
- 💬 **Real-time Chat** - Socket.IO powered messaging
- 🎤 **Media Controls** - Camera and microphone toggle
- 👥 **Participant Management** - Live participant list updates