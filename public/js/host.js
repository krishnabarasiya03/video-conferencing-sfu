// Host page JavaScript
let socket;
let localStream;
let peerConnections = {};
let meetingCode;
let meetingId;
let isMicMuted = false;
let isCameraOff = false;

// Initialize when page loads
document.addEventListener('DOMContentLoaded', function() {
    createMeeting();
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
            isHost: true,
            userName: hostName
        });
        
        setupSocketListeners();
        
        // Show meeting room and hide setup
        document.querySelector('.meeting-setup').style.display = 'none';
        document.getElementById('meetingRoom').style.display = 'block';
        
    } catch (error) {
        console.error('Error starting meeting:', error);
        alert('Failed to access camera/microphone. Please check permissions.');
    }
}

function setupSocketListeners() {
    socket.on('host-assigned', () => {
        console.log('Host privileges assigned');
    });
    
    socket.on('user-joined', (data) => {
        console.log('User joined:', data);
        addParticipant(data.userId, data.userName);
        updateParticipantCount();
        
        // Create peer connection for new user
        createPeerConnection(data.userId);
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
    label.textContent = `User-${userId.substring(0, 6)}`;
    
    videoContainer.appendChild(video);
    videoContainer.appendChild(label);
    remoteVideos.appendChild(videoContainer);
}

function updateParticipantCount() {
    const participants = document.querySelectorAll('.participant');
    document.getElementById('participantCount').textContent = participants.length;
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