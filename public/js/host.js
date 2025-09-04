// Host page JavaScript
let socket;
let localStream;
let peerConnections = {};
let meetingCode;
let meetingId;
let isMicMuted = false;
let isCameraOff = false;
let isScreenSharing = false;
let screenStream = null;

// Initialize when page loads
document.addEventListener('DOMContentLoaded', function() {
    createMeeting();
    
    // Add Enter key listener for chat input
    const chatInput = document.getElementById('chatInput');
    if (chatInput) {
        chatInput.addEventListener('keypress', function(e) {
            if (e.key === 'Enter') {
                sendMessage();
            }
        });
    }
});

function goHome() {
    if (socket) {
        socket.disconnect();
    }
    if (localStream) {
        localStream.getTracks().forEach(track => track.stop());
    }
    window.location.href = '/';
}

async function createMeeting() {
    try {
        const response = await fetch('/api/meeting/create', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            }
        });
        
        const data = await response.json();
        
        if (data.success) {
            meetingCode = data.meetingCode;
            meetingId = data.meetingId;
            
            document.getElementById('meetingCode').textContent = meetingCode;
            document.getElementById('loadingMessage').style.display = 'none';
        } else {
            throw new Error(data.error || 'Failed to create meeting');
        }
    } catch (error) {
        console.error('Error creating meeting:', error);
        alert('Failed to create meeting. Please try again.');
        goHome();
    }
}

function copyMeetingCode() {
    const codeElement = document.getElementById('meetingCode');
    const code = codeElement.textContent;
    
    navigator.clipboard.writeText(code).then(() => {
        const copyBtn = document.querySelector('.btn-copy');
        const originalText = copyBtn.textContent;
        copyBtn.textContent = 'Copied!';
        setTimeout(() => {
            copyBtn.textContent = originalText;
        }, 2000);
    }).catch(err => {
        console.error('Failed to copy: ', err);
        // Fallback for older browsers
        const textArea = document.createElement('textarea');
        textArea.value = code;
        document.body.appendChild(textArea);
        textArea.select();
        document.execCommand('copy');
        document.body.removeChild(textArea);
        alert('Meeting code copied to clipboard!');
    });
}

async function startMeeting() {
    const hostName = document.getElementById('hostName').value.trim() || 'Host';
    
    try {
        // Try to get user media, but fallback to dummy stream if not available
        try {
            localStream = await navigator.mediaDevices.getUserMedia({
                video: true,
                audio: true
            });
        } catch (mediaError) {
            console.warn('Camera/microphone not available, creating dummy stream for testing');
            // Create a dummy canvas stream for testing
            const canvas = document.createElement('canvas');
            canvas.width = 640;
            canvas.height = 480;
            const ctx = canvas.getContext('2d');
            
            // Draw a simple test pattern
            ctx.fillStyle = '#4a90e2';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            ctx.fillStyle = 'white';
            ctx.font = '24px Arial';
            ctx.textAlign = 'center';
            ctx.fillText('Host Video (Test Mode)', canvas.width / 2, canvas.height / 2);
            
            // Create stream from canvas
            localStream = canvas.captureStream(30);
            
            // Add dummy audio track
            const audioContext = new AudioContext();
            const oscillator = audioContext.createOscillator();
            const destination = audioContext.createMediaStreamDestination();
            oscillator.connect(destination);
            oscillator.frequency.value = 440; // A4 note
            oscillator.start();
            
            // Add audio track to stream
            localStream.addTrack(destination.stream.getAudioTracks()[0]);
        }
        
        document.getElementById('localVideo').srcObject = localStream;
        
        // Initialize Socket.IO
        socket = io();
        
        socket.emit('join-meeting', {
            meetingCode: meetingCode,
            isHost: true,
            userName: hostName
        });
        
        setupSocketListeners();
        
        // Show meeting room and hide setup
        document.querySelector('.meeting-setup').style.display = 'none';
        document.getElementById('meetingRoom').style.display = 'block';
        
    } catch (error) {
        console.error('Error starting meeting:', error);
        alert('Failed to start meeting. Please try again.');
    }
}

function setupSocketListeners() {
    socket.on('host-assigned', () => {
        console.log('Host privileges assigned');
        // Add host to their own participants list
        const hostName = document.getElementById('hostName').value.trim() || 'Host';
        const participantsList = document.getElementById('participantsList');
        const hostDiv = document.createElement('div');
        hostDiv.className = 'participant';
        hostDiv.id = `participant-host`;
        hostDiv.textContent = `You (Host)`;
        participantsList.appendChild(hostDiv);
        updateParticipantCount();
    });
    
    socket.on('user-joined', (data) => {
        console.log('User joined:', data);
        // Don't add self to the list if this is the host's own join event
        if (data.userId !== socket.id) {
            addParticipant(data.userId, data.userName);
            updateParticipantCount();
            
            // Create peer connection for new user
            createPeerConnection(data.userId);
        }
    });
    
    socket.on('user-left', (data) => {
        console.log('User left:', data);
        removeParticipant(data.userId);
        updateParticipantCount();
        
        // Clean up peer connection
        if (peerConnections[data.userId]) {
            peerConnections[data.userId].close();
            delete peerConnections[data.userId];
        }
    });
    
    socket.on('offer', async (data) => {
        console.log('Received offer from:', data.sender);
        await handleOffer(data.offer, data.sender);
    });
    
    socket.on('answer', async (data) => {
        console.log('Received answer from:', data.sender);
        await handleAnswer(data.answer, data.sender);
    });
    
    socket.on('ice-candidate', async (data) => {
        console.log('Received ICE candidate from:', data.sender);
        await handleIceCandidate(data.candidate, data.sender);
    });
    
    socket.on('error', (data) => {
        console.error('Socket error:', data);
        alert('Error: ' + data.message);
    });
    
    socket.on('chat-message', (data) => {
        console.log('Received chat message:', data);
        addChatMessage(data.senderName, data.message, false);
    });
}

function createPeerConnection(userId) {
    const pc = new RTCPeerConnection({
        iceServers: [
            { urls: 'stun:stun.l.google.com:19302' }
        ]
    });
    
    // Add local stream
    localStream.getTracks().forEach(track => {
        pc.addTrack(track, localStream);
    });
    
    // Handle remote stream
    pc.ontrack = (event) => {
        console.log('Received remote stream from:', userId);
        addRemoteVideo(userId, event.streams[0]);
    };
    
    // Handle ICE candidates
    pc.onicecandidate = (event) => {
        if (event.candidate) {
            socket.emit('ice-candidate', {
                target: userId,
                candidate: event.candidate
            });
        }
    };
    
    peerConnections[userId] = pc;
    
    // Create offer (host initiates connection)
    pc.createOffer().then(offer => {
        return pc.setLocalDescription(offer);
    }).then(() => {
        socket.emit('offer', {
            target: userId,
            offer: pc.localDescription
        });
    }).catch(error => {
        console.error('Error creating offer:', error);
    });
}

async function handleOffer(offer, senderId) {
    if (!peerConnections[senderId]) {
        createPeerConnection(senderId);
    }
    
    const pc = peerConnections[senderId];
    await pc.setRemoteDescription(offer);
    
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    
    socket.emit('answer', {
        target: senderId,
        answer: answer
    });
}

async function handleAnswer(answer, senderId) {
    const pc = peerConnections[senderId];
    if (pc) {
        await pc.setRemoteDescription(answer);
    }
}

async function handleIceCandidate(candidate, senderId) {
    const pc = peerConnections[senderId];
    if (pc) {
        await pc.addIceCandidate(candidate);
    }
}

function addParticipant(userId, userName) {
    const participantsList = document.getElementById('participantsList');
    const participantDiv = document.createElement('div');
    participantDiv.className = 'participant';
    participantDiv.id = `participant-${userId}`;
    participantDiv.textContent = userName;
    participantsList.appendChild(participantDiv);
    
    // Also add to remote participants display
    addRemoteParticipant(userId, userName);
}

function removeParticipant(userId) {
    const participantElement = document.getElementById(`participant-${userId}`);
    if (participantElement) {
        participantElement.remove();
    }
    
    // Remove from remote participants display
    removeRemoteParticipant(userId);
}

function addRemoteVideo(userId, stream) {
    // Check if video container already exists for this user
    const existingContainer = document.getElementById(`video-container-${userId}`);
    if (existingContainer) {
        // Just update the stream source, don't create duplicate
        const video = existingContainer.querySelector('video');
        if (video) {
            video.srcObject = stream;
        }
        return;
    }
    
    // Remove the participant card and replace with actual video
    const existingCard = document.getElementById(`participant-card-${userId}`);
    if (existingCard) {
        existingCard.remove();
    }
    
    const remoteParticipants = document.getElementById('remoteParticipants');
    
    // Create video container
    const videoContainer = document.createElement('div');
    videoContainer.className = 'remote-video-container';
    videoContainer.id = `video-container-${userId}`;
    
    // Create video element
    const video = document.createElement('video');
    video.id = `video-${userId}`;
    video.autoplay = true;
    video.playsinline = true;
    video.muted = false; // Don't mute remote videos so host can hear participants
    video.srcObject = stream;
    
    // Create video label
    const label = document.createElement('div');
    label.className = 'video-label';
    // Get participant name from the participant list
    const participantElement = document.getElementById(`participant-${userId}`);
    label.textContent = participantElement ? participantElement.textContent : `Participant ${userId}`;
    
    videoContainer.appendChild(video);
    videoContainer.appendChild(label);
    remoteParticipants.appendChild(videoContainer);
}

function addRemoteParticipant(userId, userName) {
    // Check if participant card already exists
    if (document.getElementById(`participant-card-${userId}`)) {
        return;
    }
    
    const remoteParticipants = document.getElementById('remoteParticipants');
    
    const participantCard = document.createElement('div');
    participantCard.className = 'participant-card';
    participantCard.id = `participant-card-${userId}`;
    
    const avatar = document.createElement('div');
    avatar.className = 'avatar';
    avatar.textContent = userName.charAt(0).toUpperCase();
    
    const name = document.createElement('div');
    name.className = 'name';
    name.textContent = userName;
    
    participantCard.appendChild(avatar);
    participantCard.appendChild(name);
    remoteParticipants.appendChild(participantCard);
}

function removeRemoteParticipant(userId) {
    // Remove participant card if it exists
    const participantCard = document.getElementById(`participant-card-${userId}`);
    if (participantCard) {
        participantCard.remove();
    }
    
    // Remove video container if it exists
    const videoContainer = document.getElementById(`video-container-${userId}`);
    if (videoContainer) {
        videoContainer.remove();
    }
}

function sendMessage() {
    const chatInput = document.getElementById('chatInput');
    const message = chatInput.value.trim();
    
    if (message && socket) {
        socket.emit('chat-message', {
            message: message,
            meetingCode: meetingCode
        });
        
        // Add message to own chat
        addChatMessage('You (Host)', message, true);
        chatInput.value = '';
    }
}

function addChatMessage(sender, message, isOwn = false) {
    const chatMessages = document.getElementById('chatMessages');
    
    const messageDiv = document.createElement('div');
    messageDiv.className = `chat-message ${isOwn ? 'own' : 'other'}`;
    
    const senderDiv = document.createElement('div');
    senderDiv.className = 'sender';
    senderDiv.textContent = sender;
    
    const textDiv = document.createElement('div');
    textDiv.className = 'text';
    textDiv.textContent = message;
    
    messageDiv.appendChild(senderDiv);
    messageDiv.appendChild(textDiv);
    chatMessages.appendChild(messageDiv);
    
    // Scroll to bottom
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

async function toggleScreenShare() {
    const screenShareBtn = document.getElementById('screenShareBtn');
    
    if (!isScreenSharing) {
        try {
            screenStream = await navigator.mediaDevices.getDisplayMedia({
                video: true,
                audio: true
            });
            
            // Replace video track in all peer connections
            const videoTrack = screenStream.getVideoTracks()[0];
            
            for (const userId in peerConnections) {
                const pc = peerConnections[userId];
                const sender = pc.getSenders().find(s => s.track && s.track.kind === 'video');
                if (sender) {
                    await sender.replaceTrack(videoTrack);
                }
            }
            
            // Update local video
            const localVideo = document.getElementById('localVideo');
            localVideo.srcObject = screenStream;
            
            isScreenSharing = true;
            screenShareBtn.textContent = '⏹️';
            screenShareBtn.classList.add('active');
            
            // Listen for screen share end
            videoTrack.onended = () => {
                stopScreenShare();
            };
            
        } catch (error) {
            console.error('Error starting screen share:', error);
            alert('Failed to start screen sharing');
        }
    } else {
        stopScreenShare();
    }
}

async function stopScreenShare() {
    if (screenStream) {
        screenStream.getTracks().forEach(track => track.stop());
        screenStream = null;
    }
    
    // Restore camera
    try {
        const cameraStream = await navigator.mediaDevices.getUserMedia({
            video: true,
            audio: true
        });
        
        const videoTrack = cameraStream.getVideoTracks()[0];
        
        // Replace video track in all peer connections
        for (const userId in peerConnections) {
            const pc = peerConnections[userId];
            const sender = pc.getSenders().find(s => s.track && s.track.kind === 'video');
            if (sender) {
                await sender.replaceTrack(videoTrack);
            }
        }
        
        // Update local video
        const localVideo = document.getElementById('localVideo');
        localVideo.srcObject = cameraStream;
        localStream = cameraStream;
        
    } catch (error) {
        console.error('Error restoring camera:', error);
    }
    
    isScreenSharing = false;
    const screenShareBtn = document.getElementById('screenShareBtn');
    screenShareBtn.textContent = '🖥️';
    screenShareBtn.classList.remove('active');
}

function updateParticipantCount() {
    const participants = document.querySelectorAll('.participant');
    // Remove duplicates by checking unique IDs
    const uniqueIds = new Set();
    let count = 0;
    participants.forEach(p => {
        if (!uniqueIds.has(p.id)) {
            uniqueIds.add(p.id);
            count++;
        } else {
            // Remove duplicate
            p.remove();
        }
    });
    document.getElementById('participantCount').textContent = count;
}

function toggleMicrophone() {
    if (localStream) {
        const audioTrack = localStream.getAudioTracks()[0];
        if (audioTrack) {
            audioTrack.enabled = !audioTrack.enabled;
            isMicMuted = !audioTrack.enabled;
            
            const micBtn = document.getElementById('micBtn');
            micBtn.textContent = isMicMuted ? '🔇' : '🎤';
            micBtn.classList.toggle('muted', isMicMuted);
        }
    }
}

function toggleCamera() {
    if (localStream) {
        const videoTrack = localStream.getVideoTracks()[0];
        if (videoTrack) {
            videoTrack.enabled = !videoTrack.enabled;
            isCameraOff = !videoTrack.enabled;
            
            const cameraBtn = document.getElementById('cameraBtn');
            cameraBtn.textContent = isCameraOff ? '📷' : '📹';
            cameraBtn.classList.toggle('muted', isCameraOff);
        }
    }
}

function endMeeting() {
    if (confirm('Are you sure you want to end the meeting for all participants?')) {
        if (socket) {
            socket.disconnect();
        }
        if (localStream) {
            localStream.getTracks().forEach(track => track.stop());
        }
        
        // Close all peer connections
        Object.values(peerConnections).forEach(pc => pc.close());
        
        goHome();
    }
}