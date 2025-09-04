// Participant page JavaScript
let socket;
let localStream;
let peerConnections = {};
let meetingCode;
let isMicMuted = false;
let isCameraOff = false;

document.addEventListener('DOMContentLoaded', function() {
    // Check if meeting code was passed from the main page
    const urlMeetingCode = sessionStorage.getItem('meetingCode');
    if (urlMeetingCode) {
        document.getElementById('meetingCodeInput').value = urlMeetingCode;
        sessionStorage.removeItem('meetingCode');
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
}

function removeParticipant(userId) {
    const participantElement = document.getElementById(`participant-${userId}`);
    if (participantElement) {
        participantElement.remove();
    }
    
    // Remove remote video
    const videoElement = document.getElementById(`video-${userId}`);
    if (videoElement) {
        videoElement.parentElement.remove();
    }
}

function addRemoteVideo(userId, stream) {
    // Check if video already exists
    if (document.getElementById(`video-${userId}`)) {
        return;
    }
    
    const remoteVideos = document.getElementById('remoteVideos');
    
    const videoContainer = document.createElement('div');
    videoContainer.className = 'remote-video-container';
    
    const video = document.createElement('video');
    video.id = `video-${userId}`;
    video.srcObject = stream;
    video.autoplay = true;
    video.playsinline = true;
    
    const label = document.createElement('div');
    label.className = 'video-label';
    
    // Try to get the actual participant name
    const participantElement = document.getElementById(`participant-${userId}`);
    if (participantElement) {
        label.textContent = participantElement.textContent;
    } else {
        label.textContent = `User-${userId.substring(0, 6)}`;
    }
    
    videoContainer.appendChild(video);
    videoContainer.appendChild(label);
    remoteVideos.appendChild(videoContainer);
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