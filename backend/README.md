# Backend - Video Conferencing SFU

This is the backend component of the Video Conferencing SFU application built with Node.js and Express.

## Structure

```
backend/
├── server.js         # Main server application
├── package.json      # Dependencies and scripts
└── package-lock.json # Dependency lock file
```

## Technology Stack

- **Express.js** - Web server framework
- **Socket.IO** - Real-time bidirectional communication
- **UUID** - Unique identifier generation
- **CORS** - Cross-origin resource sharing
- **Path** - File path utilities

## Features

### API Endpoints

- `POST /api/meeting/create` - Create a new meeting and get a code
- `POST /api/meeting/join` - Validate and join an existing meeting
- `GET /api/meeting/:code` - Get meeting information by code

### Socket.IO Events

#### Server → Client
- `host-assigned` - Confirm host role assignment
- `user-joined` - Notify when a user joins
- `user-left` - Notify when a user leaves
- `host-left` - Notify when host leaves (ends meeting)
- `participants-list` - Send current participant list
- `chat-message` - Broadcast chat messages
- `offer` - WebRTC offer for peer connection
- `answer` - WebRTC answer for peer connection
- `ice-candidate` - ICE candidate for connection

#### Client → Server
- `join-meeting` - Join a meeting room
- `chat-message` - Send chat message
- `offer` - Send WebRTC offer
- `answer` - Send WebRTC answer
- `ice-candidate` - Send ICE candidate
- `disconnect` - Handle user disconnection

## Development

### Install Dependencies
```bash
npm install
```

### Start Server
```bash
npm start
```

### Development Mode (with auto-restart)
```bash
npm run dev
```

### Environment Variables

The server runs on port 3000 by default. You can set the `PORT` environment variable to change this:

```bash
PORT=8080 npm start
```

## Data Management

The application uses in-memory storage for:
- **Meeting Rooms** - Active meetings with codes and participants
- **User Information** - Connected users and their roles

Note: Data is not persisted and will be lost when the server restarts.