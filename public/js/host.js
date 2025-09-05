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

// Recording variables
let mediaRecorder = null;
let recordedChunks = [];
let isRecording = false;
let recordingStartTime = null;
let recordingTimer = null;

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
            
            // Create animated canvas with changing content
            let frame = 0;
            function drawFrame() {
                // Clear canvas
                ctx.fillStyle = '#4a90e2';
                ctx.fillRect(0, 0, canvas.width, canvas.height);
                
                // Draw animated content
                ctx.fillStyle = 'white';
                ctx.font = '24px Arial';
                ctx.textAlign = 'center';
                ctx.fillText('Host Video (Test Mode)', canvas.width / 2, canvas.height / 2 - 20);
                
                // Add a simple animation - bouncing circle
                const time = Date.now() * 0.002;
                const x = canvas.width / 2 + Math.sin(time) * 100;
                const y = canvas.height / 2 + 40 + Math.sin(time * 1.5) * 20;
                
                ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
                ctx.beginPath();
                ctx.arc(x, y, 20, 0, Math.PI * 2);
                ctx.fill();
                
                // Add frame counter for visual confirmation
                ctx.fillStyle = 'white';
                ctx.font = '16px Arial';
                ctx.fillText(`Frame: ${frame++}`, canvas.width / 2, canvas.height - 30);
                
                requestAnimationFrame(drawFrame);
            }
            drawFrame();
            
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
        
        // Add video click listeners for expansion functionality
        addVideoClickListeners();
        
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
    // Add click listener for local video
    const localVideoContainer = document.querySelector('.local-video-container');
    if (localVideoContainer) {
        localVideoContainer.addEventListener('click', function() {
            const localVideo = document.getElementById('localVideo');
            expandVideo(localVideo);
        });
    }
    
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

// Recording functionality
async function toggleRecording() {
    if (isRecording) {
        stopRecording();
    } else {
        await startRecording();
    }
}

async function startRecording() {
    try {
        // Create a canvas to composite the meeting content
        const canvas = document.createElement('canvas');
        canvas.width = 1920;
        canvas.height = 1080;
        const ctx = canvas.getContext('2d');
        
        // Add roundRect polyfill for older browsers
        if (!ctx.roundRect) {
            ctx.roundRect = function(x, y, width, height, radius) {
                this.beginPath();
                this.moveTo(x + radius, y);
                this.lineTo(x + width - radius, y);
                this.quadraticCurveTo(x + width, y, x + width, y + radius);
                this.lineTo(x + width, y + height - radius);
                this.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
                this.lineTo(x + radius, y + height);
                this.quadraticCurveTo(x, y + height, x, y + height - radius);
                this.lineTo(x, y + radius);
                this.quadraticCurveTo(x, y, x + radius, y);
                this.closePath();
            };
        }
        
        // Get video elements for compositing
        const localVideo = document.getElementById('localVideo');
        const remoteParticipants = document.getElementById('remoteParticipants');
        
        // Create Web Audio API context for proper audio mixing
        const audioContext = new AudioContext();
        const audioDestination = audioContext.createMediaStreamDestination();
        
        // Collect and mix audio from all sources
        const audioSources = [];
        
        // Add microphone audio from local stream with proper mixing
        if (localStream && !isMicMuted) {
            const micAudioTracks = localStream.getAudioTracks();
            if (micAudioTracks.length > 0) {
                try {
                    const micSource = audioContext.createMediaStreamSource(new MediaStream([micAudioTracks[0]]));
                    const micGain = audioContext.createGain();
                    micGain.gain.value = 1.0; // Full volume for host
                    micSource.connect(micGain);
                    micGain.connect(audioDestination);
                    audioSources.push({ source: micSource, gain: micGain, name: 'Host Microphone' });
                    console.log('Added host microphone audio to recording');
                } catch (audioError) {
                    console.warn('Failed to add host microphone audio:', audioError);
                }
            }
        }
        
        // Add audio from remote participants with proper mixing
        Object.entries(peerConnections).forEach(([userId, pc]) => {
            try {
                const receivers = pc.getReceivers();
                receivers.forEach(receiver => {
                    if (receiver.track && receiver.track.kind === 'audio' && receiver.track.readyState === 'live') {
                        try {
                            const participantSource = audioContext.createMediaStreamSource(new MediaStream([receiver.track]));
                            const participantGain = audioContext.createGain();
                            participantGain.gain.value = 1.0; // Full volume for participants
                            participantSource.connect(participantGain);
                            participantGain.connect(audioDestination);
                            audioSources.push({ source: participantSource, gain: participantGain, name: `Participant ${userId}` });
                            console.log(`Added participant ${userId} audio to recording`);
                        } catch (participantAudioError) {
                            console.warn(`Failed to add participant ${userId} audio:`, participantAudioError);
                        }
                    }
                });
            } catch (pcError) {
                console.warn(`Failed to process audio for participant ${userId}:`, pcError);
            }
        });
        
        console.log(`Recording will include ${audioSources.length} audio source(s)`);
        
        // Function to calculate optimal grid layout for full-screen experience
        function calculateGridLayout(totalVideos) {
            if (totalVideos === 1) {
                return { cols: 1, rows: 1, videoWidth: 960, videoHeight: 720 };
            } else if (totalVideos === 2) {
                return { cols: 2, rows: 1, videoWidth: 860, videoHeight: 645 };
            } else if (totalVideos <= 4) {
                return { cols: 2, rows: 2, videoWidth: 860, videoHeight: 480 };
            } else if (totalVideos <= 6) {
                return { cols: 3, rows: 2, videoWidth: 560, videoHeight: 420 };
            } else {
                return { cols: 4, rows: 2, videoWidth: 420, videoHeight: 315 };
            }
        }
        
        // Function to draw the meeting content onto canvas with improved full-screen layout
        function drawMeetingContent() {
            // Clear canvas with dark background
            ctx.fillStyle = '#1a1a1a';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            
            // Draw title with better styling
            ctx.fillStyle = '#ffffff';
            ctx.font = 'bold 28px Arial';
            ctx.textAlign = 'center';
            ctx.fillText('Meeting Recording', canvas.width / 2, 40);
            
            // Collect all videos (local + remote)
            const allVideos = [];
            
            // Add local video (host)
            if (localVideo && localVideo.videoWidth > 0) {
                allVideos.push({
                    video: localVideo,
                    name: 'You (Host)',
                    isHost: true
                });
            }
            
            // Add remote participant videos
            if (remoteParticipants) {
                const remoteVideos = remoteParticipants.querySelectorAll('video');
                remoteVideos.forEach((video, index) => {
                    if (video.videoWidth > 0) {
                        const container = video.closest('.remote-video-container');
                        const label = container ? container.querySelector('.video-label') : null;
                        const participantName = label ? label.textContent : `Participant ${index + 1}`;
                        
                        allVideos.push({
                            video: video,
                            name: participantName,
                            isHost: false
                        });
                    }
                });
            }
            
            // Calculate grid layout for optimal full-screen experience
            const layout = calculateGridLayout(allVideos.length);
            const marginX = 40;
            const marginY = 80;
            const spacingX = 20;
            const spacingY = 20;
            
            // Calculate starting positions to center the grid
            const totalGridWidth = layout.cols * layout.videoWidth + (layout.cols - 1) * spacingX;
            const totalGridHeight = layout.rows * layout.videoHeight + (layout.rows - 1) * spacingY;
            const startX = (canvas.width - totalGridWidth) / 2;
            const startY = marginY + 20; // Leave space for title
            
            // Draw all videos in grid layout
            allVideos.forEach((videoInfo, index) => {
                const col = index % layout.cols;
                const row = Math.floor(index / layout.cols);
                
                const x = startX + col * (layout.videoWidth + spacingX);
                const y = startY + row * (layout.videoHeight + spacingY);
                
                try {
                    // Draw video with rounded corners effect
                    ctx.save();
                    ctx.beginPath();
                    ctx.roundRect(x, y, layout.videoWidth, layout.videoHeight, 8);
                    ctx.clip();
                    
                    ctx.drawImage(videoInfo.video, x, y, layout.videoWidth, layout.videoHeight);
                    ctx.restore();
                    
                    // Add border for host video
                    if (videoInfo.isHost) {
                        ctx.strokeStyle = '#4CAF50';
                        ctx.lineWidth = 4;
                        ctx.strokeRect(x - 2, y - 2, layout.videoWidth + 4, layout.videoHeight + 4);
                    }
                    
                    // Add label with better styling
                    ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
                    ctx.fillRect(x, y + layout.videoHeight - 45, layout.videoWidth, 45);
                    
                    ctx.fillStyle = '#ffffff';
                    ctx.font = 'bold 18px Arial';
                    ctx.textAlign = 'center';
                    ctx.fillText(videoInfo.name, x + layout.videoWidth / 2, y + layout.videoHeight - 15);
                    
                    // Add host indicator
                    if (videoInfo.isHost) {
                        ctx.fillStyle = '#4CAF50';
                        ctx.font = '14px Arial';
                        ctx.fillText('(HOST)', x + layout.videoWidth / 2, y + layout.videoHeight - 32);
                    }
                    
                } catch (e) {
                    // If video not ready, draw placeholder with better styling
                    ctx.fillStyle = '#333333';
                    ctx.fillRect(x, y, layout.videoWidth, layout.videoHeight);
                    
                    ctx.fillStyle = '#666666';
                    ctx.strokeStyle = '#555555';
                    ctx.lineWidth = 2;
                    ctx.strokeRect(x, y, layout.videoWidth, layout.videoHeight);
                    
                    ctx.fillStyle = '#ffffff';
                    ctx.font = 'bold 24px Arial';
                    ctx.textAlign = 'center';
                    ctx.fillText(videoInfo.name, x + layout.videoWidth / 2, y + layout.videoHeight / 2 - 10);
                    
                    ctx.font = '16px Arial';
                    ctx.fillStyle = '#cccccc';
                    ctx.fillText('Video Loading...', x + layout.videoWidth / 2, y + layout.videoHeight / 2 + 20);
                }
            });
            
            // Add recording info and timestamp with better positioning
            ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
            ctx.fillRect(20, canvas.height - 80, 400, 60);
            
            ctx.fillStyle = '#ffffff';
            ctx.font = 'bold 16px Arial';
            ctx.textAlign = 'left';
            const now = new Date();
            ctx.fillText(`🔴 Recording: ${now.toLocaleString()}`, 35, canvas.height - 50);
            
            // Add participant count
            ctx.font = '14px Arial';
            ctx.fillStyle = '#cccccc';
            ctx.fillText(`Participants: ${allVideos.length}`, 35, canvas.height - 30);
        }
        
        // Start the drawing loop with better frame management
        let animationFrame;
        function animate() {
            try {
                drawMeetingContent();
                animationFrame = requestAnimationFrame(animate);
            } catch (error) {
                console.error('Error in animation frame:', error);
                // Continue animating even if one frame fails
                animationFrame = requestAnimationFrame(animate);
            }
        }
        animate();
        
        // Capture video stream from canvas with higher quality
        const canvasStream = canvas.captureStream(30); // 30 FPS
        
        // Create combined stream with canvas video and mixed audio
        const combinedStream = new MediaStream([
            ...canvasStream.getVideoTracks(),
            ...audioDestination.stream.getAudioTracks()
        ]);
        
        // Store cleanup data
        combinedStream._animationFrame = animationFrame;
        combinedStream._audioContext = audioContext;
        combinedStream._audioSources = audioSources;

        // Check for MediaRecorder support with better error handling
        let mimeType = 'video/webm';
        if (MediaRecorder.isTypeSupported('video/webm;codecs=vp9,opus')) {
            mimeType = 'video/webm;codecs=vp9,opus';
        } else if (MediaRecorder.isTypeSupported('video/webm;codecs=vp8,opus')) {
            mimeType = 'video/webm;codecs=vp8,opus';
        } else if (!MediaRecorder.isTypeSupported('video/webm')) {
            throw new Error('WebM recording not supported in this browser');
        }
        
        console.log('Using MIME type:', mimeType);

        // Initialize MediaRecorder with better settings
        recordedChunks = [];
        mediaRecorder = new MediaRecorder(combinedStream, { 
            mimeType,
            videoBitsPerSecond: 5000000, // 5 Mbps for better quality
            audioBitsPerSecond: 128000   // 128 kbps for good audio quality
        });

        mediaRecorder.ondataavailable = function(event) {
            if (event.data && event.data.size > 0) {
                recordedChunks.push(event.data);
                console.log(`Recorded chunk: ${event.data.size} bytes`);
            }
        };

        mediaRecorder.onstop = function() {
            console.log('MediaRecorder stopped, total chunks:', recordedChunks.length);
            saveRecording();
        };

        mediaRecorder.onerror = function(event) {
            console.error('MediaRecorder error:', event.error);
            alert('Recording error occurred: ' + event.error.message);
            stopRecording();
        };

        // Start recording with better error handling
        mediaRecorder.start(1000); // Collect data every 1 second
        isRecording = true;
        recordingStartTime = Date.now();
        
        // Update UI
        updateRecordingUI();
        startRecordingTimer();

        console.log('Recording started successfully with improved audio/video quality');

    } catch (error) {
        console.error('Error starting recording:', error);
        
        if (error.name === 'NotAllowedError') {
            alert('Recording permission denied. Please allow recording to proceed.');
        } else if (error.name === 'NotSupportedError') {
            alert('Recording is not supported in this browser. Please use Chrome, Firefox, or Edge.');
        } else {
            alert('Failed to start recording: ' + error.message);
        }
        
        // Reset state if recording failed
        isRecording = false;
        updateRecordingUI();
    }
}

function stopRecording() {
    if (mediaRecorder && isRecording) {
        mediaRecorder.stop();
        isRecording = false;
        
        // Clean up animation frame
        if (mediaRecorder.stream && mediaRecorder.stream._animationFrame) {
            cancelAnimationFrame(mediaRecorder.stream._animationFrame);
            console.log('Animation frame cancelled');
        }
        
        // Clean up audio context and sources
        if (mediaRecorder.stream && mediaRecorder.stream._audioContext) {
            try {
                // Disconnect audio sources
                if (mediaRecorder.stream._audioSources) {
                    mediaRecorder.stream._audioSources.forEach(({ source, gain, name }) => {
                        try {
                            source.disconnect();
                            gain.disconnect();
                            console.log(`Disconnected audio source: ${name}`);
                        } catch (e) {
                            console.warn(`Failed to disconnect audio source ${name}:`, e);
                        }
                    });
                }
                
                // Close audio context
                mediaRecorder.stream._audioContext.close().then(() => {
                    console.log('Audio context closed successfully');
                }).catch(e => {
                    console.warn('Failed to close audio context:', e);
                });
            } catch (error) {
                console.warn('Error cleaning up audio resources:', error);
            }
        }
        
        // Stop all tracks
        if (mediaRecorder.stream) {
            mediaRecorder.stream.getTracks().forEach(track => {
                track.stop();
                console.log(`Stopped track: ${track.kind}`);
            });
        }
        
        // Clear references to prevent memory leaks
        if (mediaRecorder.stream) {
            mediaRecorder.stream._animationFrame = null;
            mediaRecorder.stream._audioContext = null;
            mediaRecorder.stream._audioSources = null;
        }
        
        // Update UI
        updateRecordingUI();
        stopRecordingTimer();
        
        console.log('Recording stopped and resources cleaned up');
    }
}

function updateRecordingUI() {
    const recordBtn = document.getElementById('recordBtn');
    const recordingStatus = document.getElementById('recordingStatus');
    const recordIcon = recordBtn.querySelector('.record-icon');
    const recordText = recordBtn.querySelector('.record-text');
    
    if (isRecording) {
        recordBtn.classList.add('recording');
        recordIcon.textContent = '⏹️';
        recordText.textContent = 'Stop';
        recordingStatus.style.display = 'flex';
    } else {
        recordBtn.classList.remove('recording');
        recordIcon.textContent = '🔴';
        recordText.textContent = 'Record';
        recordingStatus.style.display = 'none';
    }
}

function startRecordingTimer() {
    recordingTimer = setInterval(() => {
        if (recordingStartTime) {
            const elapsed = Date.now() - recordingStartTime;
            const minutes = Math.floor(elapsed / 60000);
            const seconds = Math.floor((elapsed % 60000) / 1000);
            const timeStr = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
            
            const recordingTime = document.getElementById('recordingTime');
            if (recordingTime) {
                recordingTime.textContent = timeStr;
            }
        }
    }, 1000);
}

function stopRecordingTimer() {
    if (recordingTimer) {
        clearInterval(recordingTimer);
        recordingTimer = null;
    }
    recordingStartTime = null;
}

function saveRecording() {
    if (recordedChunks.length === 0) {
        console.warn('No recorded data available');
        return;
    }

    // Create blob from recorded chunks
    const blob = new Blob(recordedChunks, { type: 'video/webm' });
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `meeting-recording-${timestamp}.webm`;
    
    // Save to localStorage using base64 (for smaller files)
    // For larger files, we'd use IndexedDB, but localStorage works for demo
    const reader = new FileReader();
    reader.onload = function() {
        try {
            const base64Data = reader.result;
            const recordings = getStoredRecordings();
            
            const recordingData = {
                id: Date.now(),
                filename: filename,
                timestamp: new Date().toISOString(),
                size: blob.size,
                data: base64Data,
                meetingCode: meetingCode
            };
            
            recordings.push(recordingData);
            
            // Store in localStorage (with size limit check)
            const dataString = JSON.stringify(recordings);
            if (dataString.length > 5 * 1024 * 1024) { // 5MB limit
                alert('Recording too large for localStorage. Download will start automatically.');
                downloadRecording(blob, filename);
            } else {
                localStorage.setItem('meetingRecordings', dataString);
                alert(`Recording saved successfully as ${filename}. Check browser storage or download from menu.`);
            }
            
            // Also offer immediate download
            downloadRecording(blob, filename);
            
        } catch (error) {
            console.error('Error saving recording:', error);
            alert('Failed to save recording to storage. Download will start automatically.');
            downloadRecording(blob, filename);
        }
    };
    
    reader.readAsDataURL(blob);
}

function getStoredRecordings() {
    try {
        const stored = localStorage.getItem('meetingRecordings');
        return stored ? JSON.parse(stored) : [];
    } catch (error) {
        console.error('Error reading stored recordings:', error);
        return [];
    }
}

function downloadRecording(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.style.display = 'none';
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

// Clean up recording when meeting ends
const originalEndMeeting = endMeeting;
endMeeting = function() {
    if (isRecording) {
        stopRecording();
    }
    originalEndMeeting();
};

// Recordings management functions
function showRecordings() {
    const modal = document.getElementById('recordingsModal');
    const recordingsList = document.getElementById('recordingsList');
    
    // Get stored recordings
    const recordings = getStoredRecordings();
    
    // Clear previous content
    recordingsList.innerHTML = '';
    
    if (recordings.length === 0) {
        recordingsList.innerHTML = '<div class="no-recordings">No recordings found</div>';
    } else {
        recordings.forEach(recording => {
            const recordingItem = createRecordingItem(recording);
            recordingsList.appendChild(recordingItem);
        });
    }
    
    modal.classList.add('active');
}

function closeRecordingsModal() {
    const modal = document.getElementById('recordingsModal');
    modal.classList.remove('active');
}

function createRecordingItem(recording) {
    const item = document.createElement('div');
    item.className = 'recording-item';
    
    const sizeInMB = (recording.size / (1024 * 1024)).toFixed(2);
    const date = new Date(recording.timestamp).toLocaleString();
    
    item.innerHTML = `
        <div class="recording-info">
            <div class="recording-filename">${recording.filename}</div>
            <div class="recording-details">
                ${date} • ${sizeInMB} MB • Meeting: ${recording.meetingCode}
            </div>
        </div>
        <div class="recording-actions">
            <button class="btn-download" onclick="downloadStoredRecording(${recording.id})">Download</button>
            <button class="btn-delete" onclick="deleteRecording(${recording.id})">Delete</button>
        </div>
    `;
    
    return item;
}

function downloadStoredRecording(recordingId) {
    const recordings = getStoredRecordings();
    const recording = recordings.find(r => r.id === recordingId);
    
    if (recording) {
        // Convert base64 back to blob
        fetch(recording.data)
            .then(res => res.blob())
            .then(blob => {
                downloadRecording(blob, recording.filename);
            })
            .catch(error => {
                console.error('Error downloading recording:', error);
                alert('Failed to download recording');
            });
    }
}

function deleteRecording(recordingId) {
    if (confirm('Are you sure you want to delete this recording?')) {
        const recordings = getStoredRecordings();
        const updatedRecordings = recordings.filter(r => r.id !== recordingId);
        
        localStorage.setItem('meetingRecordings', JSON.stringify(updatedRecordings));
        
        // Refresh the modal
        showRecordings();
    }
}

// Close modals when clicking outside
document.addEventListener('click', function(event) {
    const recordingsModal = document.getElementById('recordingsModal');
    if (event.target === recordingsModal) {
        closeRecordingsModal();
    }
});

// Close modals with Escape key
document.addEventListener('keydown', function(event) {
    if (event.key === 'Escape') {
        closeRecordingsModal();
    }
});