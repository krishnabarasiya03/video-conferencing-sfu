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
        canvas.width = 1280;
        canvas.height = 720;
        const ctx = canvas.getContext('2d');
        
        // Set up drawing style
        ctx.fillStyle = '#1a1a1a';
        ctx.font = '24px Arial';
        
        // Get video elements for compositing
        const localVideo = document.getElementById('localVideo');
        const remoteParticipants = document.getElementById('remoteParticipants');
        
        // Function to draw the meeting content onto canvas
        function drawMeetingContent() {
            // Clear canvas with dark background
            ctx.fillStyle = '#1a1a1a';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            
            // Draw title
            ctx.fillStyle = '#ffffff';
            ctx.textAlign = 'center';
            ctx.fillText('Meeting Recording', canvas.width / 2, 40);
            
            // Draw local video (host) - larger size in top-left
            if (localVideo && localVideo.videoWidth > 0) {
                const localWidth = 320;
                const localHeight = 240;
                const localX = 30;
                const localY = 60;
                
                try {
                    ctx.drawImage(localVideo, localX, localY, localWidth, localHeight);
                    
                    // Add label for local video
                    ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
                    ctx.fillRect(localX, localY + localHeight - 40, localWidth, 40);
                    ctx.fillStyle = '#ffffff';
                    ctx.font = '16px Arial';
                    ctx.textAlign = 'center';
                    ctx.fillText('You (Host)', localX + localWidth / 2, localY + localHeight - 15);
                } catch (e) {
                    // If video not ready, draw placeholder
                    ctx.fillStyle = '#333333';
                    ctx.fillRect(localX, localY, localWidth, localHeight);
                    ctx.fillStyle = '#ffffff';
                    ctx.textAlign = 'center';
                    ctx.fillText('Host Video', localX + localWidth / 2, localY + localHeight / 2);
                }
            }
            
            // Draw remote participant videos
            if (remoteParticipants) {
                const remoteVideos = remoteParticipants.querySelectorAll('video');
                const participantWidth = 240;
                const participantHeight = 180;
                const startX = 400;
                const startY = 60;
                const spacing = 260;
                
                remoteVideos.forEach((video, index) => {
                    if (video.videoWidth > 0) {
                        const x = startX + (index % 3) * spacing;
                        const y = startY + Math.floor(index / 3) * (participantHeight + 60);
                        
                        try {
                            ctx.drawImage(video, x, y, participantWidth, participantHeight);
                            
                            // Add label for participant
                            ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
                            ctx.fillRect(x, y + participantHeight - 30, participantWidth, 30);
                            ctx.fillStyle = '#ffffff';
                            ctx.font = '14px Arial';
                            ctx.textAlign = 'center';
                            
                            // Get participant name from the video container
                            const container = video.closest('.remote-video-container');
                            const label = container ? container.querySelector('.video-label') : null;
                            const participantName = label ? label.textContent : `Participant ${index + 1}`;
                            
                            ctx.fillText(participantName, x + participantWidth / 2, y + participantHeight - 10);
                        } catch (e) {
                            // If video not ready, draw placeholder
                            ctx.fillStyle = '#333333';
                            ctx.fillRect(x, y, participantWidth, participantHeight);
                            ctx.fillStyle = '#ffffff';
                            ctx.textAlign = 'center';
                            ctx.fillText(`Participant ${index + 1}`, x + participantWidth / 2, y + participantHeight / 2);
                        }
                    }
                });
            }
            
            // Add recording timestamp
            ctx.fillStyle = '#ffffff';
            ctx.font = '16px Arial';
            ctx.textAlign = 'left';
            const now = new Date();
            ctx.fillText(`Recording: ${now.toLocaleString()}`, 50, canvas.height - 30);
        }
        
        // Start the drawing loop
        let animationFrame;
        function animate() {
            drawMeetingContent();
            animationFrame = requestAnimationFrame(animate);
        }
        animate();
        
        // Capture video stream from canvas
        const canvasStream = canvas.captureStream(30); // 30 FPS
        
        // Collect audio tracks from all sources
        const audioTracks = [];
        
        // Add microphone audio from local stream
        if (localStream) {
            const micAudioTracks = localStream.getAudioTracks();
            if (micAudioTracks.length > 0 && !isMicMuted) {
                audioTracks.push(micAudioTracks[0]);
            }
        }
        
        // Add audio from remote participants
        Object.values(peerConnections).forEach(pc => {
            // Use getReceivers() for modern WebRTC API
            const receivers = pc.getReceivers();
            receivers.forEach(receiver => {
                if (receiver.track && receiver.track.kind === 'audio' && receiver.track.readyState === 'live') {
                    audioTracks.push(receiver.track);
                }
            });
        });
        
        // Create combined stream with canvas video and all audio
        const combinedStream = new MediaStream([
            ...canvasStream.getVideoTracks(),
            ...audioTracks
        ]);
        
        // Store animation frame ID for cleanup
        combinedStream._animationFrame = animationFrame;

        // Check for MediaRecorder support
        if (!MediaRecorder.isTypeSupported('video/webm;codecs=vp9,opus')) {
            if (!MediaRecorder.isTypeSupported('video/webm')) {
                throw new Error('WebM recording not supported');
            }
        }

        // Initialize MediaRecorder
        recordedChunks = [];
        const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9,opus') 
            ? 'video/webm;codecs=vp9,opus' 
            : 'video/webm';
            
        mediaRecorder = new MediaRecorder(combinedStream, { mimeType });

        mediaRecorder.ondataavailable = function(event) {
            if (event.data.size > 0) {
                recordedChunks.push(event.data);
            }
        };

        mediaRecorder.onstop = function() {
            saveRecording();
        };

        mediaRecorder.onerror = function(event) {
            console.error('MediaRecorder error:', event.error);
            alert('Recording error occurred: ' + event.error.message);
            stopRecording();
        };

        // No need to listen for screen share ending since we're recording meeting content directly
        
        // Start recording
        mediaRecorder.start(1000); // Collect data every 1 second
        isRecording = true;
        recordingStartTime = Date.now();
        
        // Update UI
        updateRecordingUI();
        startRecordingTimer();

        console.log('Recording started successfully');

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
        
        // Stop animation frame if it exists
        if (mediaRecorder.stream && mediaRecorder.stream._animationFrame) {
            cancelAnimationFrame(mediaRecorder.stream._animationFrame);
        }
        
        // Stop all tracks
        if (mediaRecorder.stream) {
            mediaRecorder.stream.getTracks().forEach(track => track.stop());
        }
        
        // Update UI
        updateRecordingUI();
        stopRecordingTimer();
        
        console.log('Recording stopped');
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
            <button class="btn-play" onclick="playStoredRecording(${recording.id})">Play</button>
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

function playStoredRecording(recordingId) {
    const recordings = getStoredRecordings();
    const recording = recordings.find(r => r.id === recordingId);
    
    if (recording) {
        // Convert base64 back to blob
        fetch(recording.data)
            .then(res => res.blob())
            .then(blob => {
                const videoUrl = URL.createObjectURL(blob);
                showVideoPlayback(videoUrl, recording.filename);
            })
            .catch(error => {
                console.error('Error playing recording:', error);
                alert('Failed to play recording');
            });
    }
}

function showVideoPlayback(videoUrl, filename) {
    const modal = document.getElementById('videoPlaybackModal');
    const video = document.getElementById('playbackVideo');
    const title = document.getElementById('playbackTitle');
    
    video.src = videoUrl;
    title.textContent = filename;
    modal.classList.add('active');
    
    // Add ESC key listener to close modal
    document.addEventListener('keydown', handleVideoPlaybackEscape);
    
    // Clean up URL when video ends or modal closes
    video.addEventListener('ended', () => {
        URL.revokeObjectURL(videoUrl);
    });
}

function closeVideoPlaybackModal() {
    const modal = document.getElementById('videoPlaybackModal');
    const video = document.getElementById('playbackVideo');
    
    modal.classList.remove('active');
    
    // Clean up video source and URL
    if (video.src && video.src.startsWith('blob:')) {
        URL.revokeObjectURL(video.src);
    }
    video.src = '';
    
    // Remove ESC key listener
    document.removeEventListener('keydown', handleVideoPlaybackEscape);
}

function handleVideoPlaybackEscape(event) {
    if (event.key === 'Escape') {
        closeVideoPlaybackModal();
    }
}

// Close modals when clicking outside
document.addEventListener('click', function(event) {
    const recordingsModal = document.getElementById('recordingsModal');
    if (event.target === recordingsModal) {
        closeRecordingsModal();
    }
    
    const videoPlaybackModal = document.getElementById('videoPlaybackModal');
    if (event.target === videoPlaybackModal) {
        closeVideoPlaybackModal();
    }
});

// Close modals with Escape key
document.addEventListener('keydown', function(event) {
    if (event.key === 'Escape') {
        closeRecordingsModal();
    }
});