const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));

// Store meeting rooms with their codes
const meetingRooms = new Map();

// Generate a 6-digit meeting code
function generateMeetingCode() {
    return Math.floor(100000 + Math.random() * 900000).toString();
}

// API endpoint to create a new meeting
app.post('/api/meeting/create', (req, res) => {
    const meetingCode = generateMeetingCode();
    const meetingId = uuidv4();
    
    const meetingRoom = {
        id: meetingId,
        code: meetingCode,
        host: null,
        participants: new Set(),
        createdAt: new Date()
    };
    
    meetingRooms.set(meetingCode, meetingRoom);
    
    res.json({
        success: true,
        meetingCode: meetingCode,
        meetingId: meetingId
    });
});

// API endpoint to join a meeting
app.post('/api/meeting/join', (req, res) => {
    const { meetingCode } = req.body;
    
    if (!meetingCode) {
        return res.status(400).json({
            success: false,
            error: 'Meeting code is required'
        });
    }
    
    const meetingRoom = meetingRooms.get(meetingCode);
    
    if (!meetingRoom) {
        return res.status(404).json({
            success: false,
            error: 'Meeting not found'
        });
    }
    
    res.json({
        success: true,
        meetingId: meetingRoom.id,
        meetingCode: meetingCode
    });
});

// API endpoint to get meeting info
app.get('/api/meeting/:code', (req, res) => {
    const { code } = req.params;
    const meetingRoom = meetingRooms.get(code);
    
    if (!meetingRoom) {
        return res.status(404).json({
            success: false,
            error: 'Meeting not found'
        });
    }
    
    res.json({
        success: true,
        meeting: {
            id: meetingRoom.id,
            code: meetingRoom.code,
            participantCount: meetingRoom.participants.size,
            hasHost: meetingRoom.host !== null
        }
    });
});

// Socket.IO connection handling
io.on('connection', (socket) => {
    console.log('User connected:', socket.id);
    
    socket.on('join-meeting', (data) => {
        const { meetingCode, isHost, userName } = data;
        const meetingRoom = meetingRooms.get(meetingCode);
        
        if (!meetingRoom) {
            socket.emit('error', { message: 'Meeting not found' });
            return;
        }
        
        socket.join(meetingCode);
        socket.meetingCode = meetingCode;
        socket.userName = userName;
        socket.isHost = isHost;
        
        if (isHost && !meetingRoom.host) {
            meetingRoom.host = socket.id;
            socket.emit('host-assigned');
        } else {
            meetingRoom.participants.add(socket.id);
        }
        
        // Notify all participants about the new user
        socket.to(meetingCode).emit('user-joined', {
            userId: socket.id,
            userName: userName,
            isHost: isHost
        });
        
        // Send current participants to the new user
        const participants = Array.from(meetingRoom.participants).map(id => ({
            userId: id,
            userName: `User-${id.substring(0, 6)}` // Simplified for demo
        }));
        
        socket.emit('participants-list', participants);
        
        console.log(`User ${userName} joined meeting ${meetingCode} as ${isHost ? 'host' : 'participant'}`);
    });
    
    socket.on('offer', (data) => {
        socket.to(data.target).emit('offer', {
            offer: data.offer,
            sender: socket.id
        });
    });
    
    socket.on('answer', (data) => {
        socket.to(data.target).emit('answer', {
            answer: data.answer,
            sender: socket.id
        });
    });
    
    socket.on('ice-candidate', (data) => {
        socket.to(data.target).emit('ice-candidate', {
            candidate: data.candidate,
            sender: socket.id
        });
    });
    
    socket.on('chat-message', (data) => {
        console.log('Chat message from:', socket.userName, 'Message:', data.message);
        
        // Broadcast message to all other participants in the meeting
        socket.to(data.meetingCode).emit('chat-message', {
            message: data.message,
            senderName: socket.userName,
            senderId: socket.id,
            timestamp: new Date().toISOString()
        });
    });
    
    socket.on('disconnect', () => {
        console.log('User disconnected:', socket.id);
        
        if (socket.meetingCode) {
            const meetingRoom = meetingRooms.get(socket.meetingCode);
            if (meetingRoom) {
                if (meetingRoom.host === socket.id) {
                    meetingRoom.host = null;
                    // Notify participants that host left
                    socket.to(socket.meetingCode).emit('host-left');
                } else {
                    meetingRoom.participants.delete(socket.id);
                }
                
                // Notify remaining participants
                socket.to(socket.meetingCode).emit('user-left', {
                    userId: socket.id,
                    userName: socket.userName
                });
            }
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});