/**
 * Socket controller - handles Socket.IO connections and events
 */

const { getMeetingByCode } = require('../models/Meeting');
const { setUser, getUserById, removeUser } = require('../models/User');

/**
 * Handle socket connection and setup event listeners
 * @param {Object} io - Socket.IO server instance
 */
const handleSocketConnection = (io) => {
    io.on('connection', (socket) => {
        console.log('User connected:', socket.id);
        
        // Handle joining a meeting
        socket.on('join-meeting', (data) => {
            handleJoinMeeting(socket, data);
        });
        
        // Handle WebRTC signaling
        socket.on('offer', (data) => {
            handleOffer(socket, data);
        });
        
        socket.on('answer', (data) => {
            handleAnswer(socket, data);
        });
        
        socket.on('ice-candidate', (data) => {
            handleIceCandidate(socket, data);
        });
        
        // Handle chat messages
        socket.on('chat-message', (data) => {
            handleChatMessage(socket, data);
        });
        
        // Handle disconnection
        socket.on('disconnect', () => {
            handleDisconnection(socket);
        });
    });
};

/**
 * Handle user joining a meeting
 * @param {Object} socket - Socket instance
 * @param {Object} data - Join meeting data
 */
const handleJoinMeeting = (socket, data) => {
    const { meetingCode, isHost, userName } = data;
    const meetingRoom = getMeetingByCode(meetingCode);
    
    if (!meetingRoom) {
        socket.emit('error', { message: 'Meeting not found' });
        return;
    }
    
    socket.join(meetingCode);
    socket.meetingCode = meetingCode;
    socket.userName = userName;
    socket.isHost = isHost;
    
    // Store user information
    setUser(socket.id, userName, isHost);
    
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
    
    // Send current participants to the new user (including host if they exist)
    const participants = [];
    
    // Add host to participants list if host exists and current user is not the host
    if (meetingRoom.host && meetingRoom.host !== socket.id) {
        const hostInfo = getUserById(meetingRoom.host);
        if (hostInfo) {
            participants.push({
                userId: meetingRoom.host,
                userName: hostInfo.userName,
                isHost: true
            });
        }
    }
    
    // Add other participants
    Array.from(meetingRoom.participants).forEach(id => {
        if (id !== socket.id) {
            const userInfo = getUserById(id);
            if (userInfo) {
                participants.push({
                    userId: id,
                    userName: userInfo.userName,
                    isHost: false
                });
            }
        }
    });
    
    socket.emit('participants-list', participants);
    
    console.log(`User ${userName} joined meeting ${meetingCode} as ${isHost ? 'host' : 'participant'}`);
};

/**
 * Handle WebRTC offer
 * @param {Object} socket - Socket instance
 * @param {Object} data - Offer data
 */
const handleOffer = (socket, data) => {
    socket.to(data.target).emit('offer', {
        offer: data.offer,
        sender: socket.id
    });
};

/**
 * Handle WebRTC answer
 * @param {Object} socket - Socket instance
 * @param {Object} data - Answer data
 */
const handleAnswer = (socket, data) => {
    socket.to(data.target).emit('answer', {
        answer: data.answer,
        sender: socket.id
    });
};

/**
 * Handle ICE candidate
 * @param {Object} socket - Socket instance
 * @param {Object} data - ICE candidate data
 */
const handleIceCandidate = (socket, data) => {
    socket.to(data.target).emit('ice-candidate', {
        candidate: data.candidate,
        sender: socket.id
    });
};

/**
 * Handle chat message
 * @param {Object} socket - Socket instance
 * @param {Object} data - Chat message data
 */
const handleChatMessage = (socket, data) => {
    console.log('Chat message from:', socket.userName, 'Message:', data.message);
    
    // Broadcast message to all other participants in the meeting
    socket.to(data.meetingCode).emit('chat-message', {
        message: data.message,
        senderName: socket.userName,
        senderId: socket.id,
        timestamp: new Date().toISOString()
    });
};

/**
 * Handle user disconnection
 * @param {Object} socket - Socket instance
 */
const handleDisconnection = (socket) => {
    console.log('User disconnected:', socket.id);
    
    // Clean up user info
    removeUser(socket.id);
    
    if (socket.meetingCode) {
        const meetingRoom = getMeetingByCode(socket.meetingCode);
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
};

module.exports = {
    handleSocketConnection
};