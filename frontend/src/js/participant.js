// Participant page JavaScript
let socket;
let peerConnections = {};
let meetingCode;

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
        
        // Initialize Socket.IO - no media access required for participants
        socket = io();
        
        socket.emit('join-meeting', {
            meetingCode: meetingCode,
            isHost: false,
            userName: nameInput
        });
        
        setupSocketListeners();
        
    } catch (error) {
        console.error('Error joining meeting:', error);
        showError('Failed to join meeting. Please try again.');
    }
}

function setupSocketListeners() {
    socket.on('participants-list', (participants) => {
        console.log('Current participants:', participants);
        participants.forEach(participant => {
            addParticipant(participant.userId, participant.userName);
            // Create peer connection for existing participants (especially the host)
            if (participant.isHost) {
                // For host, participant should wait for host to initiate the connection
                console.log('Host detected in participants list:', participant.userName);
            }
        });
        updateParticipantCount();
        
        // Show meeting room
        hideLoading();
        document.getElementById('joinForm').style.display = 'none';
        document.getElementById('meetingRoom').style.display = 'block';
        
        // Add video click listeners for expansion functionality
        addVideoClickListeners();
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
    
    // Participants don't share their own media - they only receive host's stream
    
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
    
    // Add to remote participants display for all users (including host)
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

function updateParticipantCount() {
    const participants = document.querySelectorAll('.participant');
    document.getElementById('participantCount').textContent = participants.length + 1; // +1 for self
}

function leaveMeeting() {
    if (socket) {
        socket.disconnect();
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

// Video expansion functionality
function expandVideo(videoElement) {
    const modal = document.getElementById('videoModal');
    const modalVideo = document.getElementById('modalVideo');
    
    if (videoElement && videoElement.srcObject) {
        modalVideo.srcObject = videoElement.srcObject;
        modal.classList.add('active');
        
        // Add ESC key listener to close modal
        document.addEventListener('keydown', handleEscapeKey);
    }
}

function closeVideoModal() {
    const modal = document.getElementById('videoModal');
    const modalVideo = document.getElementById('modalVideo');
    
    modal.classList.remove('active');
    modalVideo.srcObject = null;
    
    // Remove ESC key listener
    document.removeEventListener('keydown', handleEscapeKey);
}

function handleEscapeKey(event) {
    if (event.key === 'Escape') {
        closeVideoModal();
    }
}

// Add click event listeners when meeting starts
function addVideoClickListeners() {
    // Add click listeners for remote videos (will be added dynamically when participants join)
    const remoteParticipants = document.getElementById('remoteParticipants');
    if (remoteParticipants) {
        remoteParticipants.addEventListener('click', function(event) {
            const videoContainer = event.target.closest('.remote-video-container');
            if (videoContainer) {
                const video = videoContainer.querySelector('video');
                if (video) {
                    expandVideo(video);
                }
            }
        });
    }
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