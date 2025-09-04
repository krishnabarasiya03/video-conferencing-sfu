// Participant page JavaScript
let socket;
let localStream;
let peerConnections = {};
let meetingCode;
let isMicMuted = false;
let isCameraOff = false;
let isScreenSharing = false;
let screenStream = null;

document.addEventListener('DOMContentLoaded', function() {
    // Check if meeting code was passed from the main page
    const urlMeetingCode = sessionStorage.getItem('meetingCode');
    if (urlMeetingCode) {
        document.getElementById('meetingCodeInput').value = urlMeetingCode;
        sessionStorage.removeItem('meetingCode');
    }
    
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

async function joinMeeting() {
    const codeInput = document.getElementById('meetingCodeInput').value.trim();
    const nameInput = document.getElementById('participantName').value.trim();
    
    if (!codeInput) {
        showError('Please enter a meeting code');
        return;
    }
    
    if (codeInput.length !== 6 || !/^\d+$/.test(codeInput)) {
        showError('Please enter a valid 6-digit meeting code');
        return;
    }
    
    if (!nameInput) {
        showError('Please enter your name');
        return;
    }
    
    meetingCode = codeInput;
    
    try {
        // Check if meeting exists
        const response = await fetch(`/api/meeting/${meetingCode}`);
        const data = await response.json();
        
        if (!data.success) {
            showError('Meeting not found. Please check the code and try again.');
            return;
        }
        
        showLoading('Joining meeting...');
        
        // Get user media
        localStream = await navigator.mediaDevices.getUserMedia({
            video: true,
            audio: true
        });
        
        document.getElementById('localVideo').srcObject = localStream;
        
        // Initialize Socket.IO
        socket = io();
        
        socket.emit('join-meeting', {
            meetingCode: meetingCode,
            isHost: false,
            userName: nameInput
        });
        
        setupSocketListeners();
        
    } catch (error) {
        console.error('Error joining meeting:', error);
        if (error.name === 'NotAllowedError') {
            showError('Camera/microphone access denied. Please allow access and try again.');
        } else {
            showError('Failed to join meeting. Please try again.');
        }
    }
}

function setupSocketListeners() {
    socket.on('participants-list', (participants) => {
        console.log('Current participants:', participants);
        participants.forEach(participant => {
            addParticipant(participant.userId, participant.userName);
        });
        updateParticipantCount();
        
        // Show meeting room
        hideLoading();
        document.getElementById('joinForm').style.display = 'none';
        document.getElementById('meetingRoom').style.display = 'block';
    });
    
    socket.on('user-joined', (data) => {
        console.log('User joined:', data);
        addParticipant(data.userId, data.userName);
        updateParticipantCount();
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
    
    socket.on('host-left', () => {
        alert('The host has left the meeting.');
        leaveMeeting();
    });
    
    socket.on('chat-message', (data) => {
        console.log('Received chat message:', data);
        addChatMessage(data.senderName, data.message, false);
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
        showError('Error: ' + data.message);
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
    return pc;
}

async function handleOffer(offer, senderId) {
    const pc = createPeerConnection(senderId);
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
    
    // Check if participant already exists
    if (document.getElementById(`participant-${userId}`)) {
        return;
    }
    
    const participantDiv = document.createElement('div');
    participantDiv.className = 'participant';
    participantDiv.id = `participant-${userId}`;
    participantDiv.textContent = userName;
    participantsList.appendChild(participantDiv);
    
    // Also add to remote participants display (but not for own user)
    if (userId !== socket.id) {
        addRemoteParticipant(userId, userName);
    }
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
    video.muted = false; // Don't mute remote videos so participants can hear host
    video.srcObject = stream;
    
    // Create video label
    const label = document.createElement('div');
    label.className = 'video-label';
    // For participants, this will typically be the host
    const participantElement = document.getElementById(`participant-${userId}`);
    label.textContent = participantElement ? participantElement.textContent : 'Host';
    
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
        addChatMessage('You', message, true);
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
            
            // Replace video track in local stream
            const videoTrack = screenStream.getVideoTracks()[0];
            const sender = peerConnections[Object.keys(peerConnections)[0]]?.getSenders()
                .find(s => s.track && s.track.kind === 'video');
            
            if (sender) {
                await sender.replaceTrack(videoTrack);
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
        const sender = peerConnections[Object.keys(peerConnections)[0]]?.getSenders()
            .find(s => s.track && s.track.kind === 'video');
        
        if (sender) {
            await sender.replaceTrack(videoTrack);
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
    document.getElementById('participantCount').textContent = participants.length + 1; // +1 for self
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

function leaveMeeting() {
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

function showError(message) {
    const errorElement = document.getElementById('errorMessage');
    errorElement.textContent = message;
    errorElement.style.display = 'block';
    hideLoading();
    
    setTimeout(() => {
        errorElement.style.display = 'none';
    }, 5000);
}

function showLoading(message) {
    const loadingElement = document.getElementById('loadingMessage');
    loadingElement.textContent = message;
    loadingElement.style.display = 'block';
}

function hideLoading() {
    document.getElementById('loadingMessage').style.display = 'none';
}

// Allow Enter key to join meeting
document.addEventListener('DOMContentLoaded', function() {
    const inputs = ['meetingCodeInput', 'participantName'];
    inputs.forEach(inputId => {
        const input = document.getElementById(inputId);
        if (input) {
            input.addEventListener('keypress', function(e) {
                if (e.key === 'Enter') {
                    joinMeeting();
                }
            });
        }
    });
    
    // Auto-format meeting code
    const meetingCodeInput = document.getElementById('meetingCodeInput');
    if (meetingCodeInput) {
        meetingCodeInput.addEventListener('input', function(e) {
            let value = e.target.value.replace(/\D/g, ''); // Remove non-digits
            if (value.length > 6) {
                value = value.substring(0, 6);
            }
            e.target.value = value;
        });
    }
});