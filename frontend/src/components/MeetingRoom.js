import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import socketService from '../services/socketService';
import mediaSoupService from '../services/mediaSoupService';

const MeetingRoom = () => {
  const { meetingCode } = useParams();
  const navigate = useNavigate();
  
  const [participants, setParticipants] = useState([]);
  const [chatMessages, setChatMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const [isAudioMuted, setIsAudioMuted] = useState(false);
  const [isVideoMuted, setIsVideoMuted] = useState(false);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [error, setError] = useState('');
  const [connected, setConnected] = useState(false);
  const [localStream, setLocalStream] = useState(null);
  const [remoteStream, setRemoteStream] = useState(null);

  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const chatMessagesRef = useRef(null);

  const userName = localStorage.getItem('userName');
  const isHost = localStorage.getItem('isHost') === 'true';

  useEffect(() => {
    if (!userName || !meetingCode) {
      navigate('/');
      return;
    }

    const initializeMeeting = async () => {
      try {
        // Connect to socket
        socketService.connect();

        // Set up socket event listeners
        setupSocketListeners();

        // Join the meeting
        socketService.joinMeeting(meetingCode, userName, isHost);

        // If host, start media capture
        if (isHost) {
          await startMediaCapture();
        }

      } catch (error) {
        console.error('Failed to initialize meeting:', error);
        setError('Failed to join meeting');
      }
    };

    const cleanup = () => {
      // Stop all tracks
      if (localStream) {
        localStream.getTracks().forEach(track => track.stop());
      }
      
      // Cleanup MediaSoup
      mediaSoupService.cleanup();
      
      // Disconnect socket
      socketService.removeAllListeners('joined-meeting');
      socketService.removeAllListeners('participant-joined');
      socketService.removeAllListeners('participant-left');
      socketService.removeAllListeners('new-message');
      socketService.removeAllListeners('host-audio-toggled');
      socketService.removeAllListeners('host-video-toggled');
      socketService.removeAllListeners('meeting-ended');
      socketService.removeAllListeners('new-producer');
      socketService.removeAllListeners('error');
      
      // Don't disconnect socket here as user might navigate to other pages
    };

    initializeMeeting();

    return () => {
      cleanup();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meetingCode, userName, navigate, isHost]);

  useEffect(() => {
    // Auto-scroll chat to bottom
    if (chatMessagesRef.current) {
      chatMessagesRef.current.scrollTop = chatMessagesRef.current.scrollHeight;
    }
  }, [chatMessages]);



  const setupSocketListeners = () => {
    socketService.on('joined-meeting', async (data) => {
      console.log('Joined meeting successfully');
      setParticipants(data.participants);
      setChatMessages(data.chatMessages);
      setConnected(true);

      // Initialize MediaSoup device
      if (data.rtpCapabilities) {
        await mediaSoupService.initializeDevice(data.rtpCapabilities);
      }

      // If host, set up media production
      if (isHost) {
        await setupMediaProduction();
      } else {
        // If participant, set up media consumption
        await setupMediaConsumption();
      }
    });

    socketService.on('participant-joined', (data) => {
      setParticipants(prev => [...prev, data.participant]);
    });

    socketService.on('participant-left', (data) => {
      setParticipants(prev => prev.filter(p => p.socketId !== data.socketId));
    });

    socketService.on('new-message', (message) => {
      setChatMessages(prev => [...prev, message]);
    });

    socketService.on('host-audio-toggled', (data) => {
      console.log('Host audio toggled:', data.muted);
    });

    socketService.on('host-video-toggled', (data) => {
      console.log('Host video toggled:', data.muted);
    });

    socketService.on('meeting-ended', () => {
      alert('Meeting has been ended by the host');
      navigate('/');
    });

    socketService.on('new-producer', async (data) => {
      console.log('New producer available:', data);
      if (!isHost && data.kind === 'video') {
        // Consume the host's video stream
        const consumer = await mediaSoupService.consumeMedia(data.producerId, meetingCode);
        if (consumer) {
          const stream = new MediaStream();
          stream.addTrack(consumer.track);
          setRemoteStream(stream);
        }
      }
    });

    socketService.on('error', (error) => {
      console.error('Socket error:', error);
      setError(error.message || 'An error occurred');
    });
  };

  const startMediaCapture = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 1280 },
          height: { ideal: 720 },
          frameRate: { ideal: 30 }
        },
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }
      });

      setLocalStream(stream);
      
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
      }

      return stream;
    } catch (error) {
      console.error('Failed to get user media:', error);
      setError('Failed to access camera/microphone');
      return null;
    }
  };

  const setupMediaProduction = async () => {
    if (!localStream) return;

    try {
      // Create send transport
      await mediaSoupService.createSendTransport(meetingCode);
      
      // Start producing media
      await mediaSoupService.startProducing(localStream, meetingCode);
      
      console.log('Media production setup complete');
    } catch (error) {
      console.error('Failed to setup media production:', error);
      setError('Failed to start streaming');
    }
  };

  const setupMediaConsumption = async () => {
    try {
      // Create receive transport
      await mediaSoupService.createRecvTransport(meetingCode);
      
      console.log('Media consumption setup complete');
    } catch (error) {
      console.error('Failed to setup media consumption:', error);
      setError('Failed to setup media receiving');
    }
  };

  const handleSendMessage = (e) => {
    e.preventDefault();
    if (newMessage.trim() && connected) {
      socketService.sendMessage(meetingCode, newMessage.trim(), userName);
      setNewMessage('');
    }
  };

  const toggleAudio = () => {
    if (isHost && localStream) {
      const audioTrack = localStream.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled;
        setIsAudioMuted(!audioTrack.enabled);
        
        // Also pause/resume the producer
        if (audioTrack.enabled) {
          mediaSoupService.resumeAudioProducer();
        } else {
          mediaSoupService.pauseAudioProducer();
        }
        
        socketService.toggleAudio(meetingCode, !audioTrack.enabled);
      }
    }
  };

  const toggleVideo = () => {
    if (isHost && localStream) {
      const videoTrack = localStream.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.enabled = !videoTrack.enabled;
        setIsVideoMuted(!videoTrack.enabled);
        
        // Also pause/resume the producer
        if (videoTrack.enabled) {
          mediaSoupService.resumeVideoProducer();
        } else {
          mediaSoupService.pauseVideoProducer();
        }
        
        socketService.toggleVideo(meetingCode, !videoTrack.enabled);
      }
    }
  };

  const shareScreen = async () => {
    if (!isHost || isScreenSharing) return;

    try {
      const screenStream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: true
      });

      setIsScreenSharing(true);
      
      // Replace video track
      const videoTrack = screenStream.getVideoTracks()[0];
      if (videoTrack && localVideoRef.current) {
        const newStream = new MediaStream();
        newStream.addTrack(videoTrack);
        if (localStream.getAudioTracks()[0]) {
          newStream.addTrack(localStream.getAudioTracks()[0]);
        }
        localVideoRef.current.srcObject = newStream;
        setLocalStream(newStream);
      }

      videoTrack.onended = () => {
        setIsScreenSharing(false);
        // Restart camera
        startMediaCapture();
      };

    } catch (error) {
      console.error('Failed to share screen:', error);
      setError('Failed to share screen');
    }
  };

  const endMeeting = () => {
    if (isHost) {
      if (window.confirm('Are you sure you want to end the meeting for everyone?')) {
        socketService.endMeeting(meetingCode);
        navigate('/');
      }
    } else {
      navigate('/');
    }
  };



  const formatTime = (timestamp) => {
    return new Date(timestamp).toLocaleTimeString();
  };

  if (error) {
    return (
      <div style={{ 
        display: 'flex', 
        justifyContent: 'center', 
        alignItems: 'center', 
        height: '100vh',
        flexDirection: 'column',
        gap: '1rem'
      }}>
        <div className="error-message" style={{ maxWidth: '400px' }}>
          {error}
        </div>
        <button onClick={() => navigate('/')} className="continue-button">
          Go Back to Home
        </button>
      </div>
    );
  }

  if (!connected) {
    return (
      <div style={{ 
        display: 'flex', 
        justifyContent: 'center', 
        alignItems: 'center', 
        height: '100vh' 
      }}>
        <div className="loading">Joining meeting...</div>
      </div>
    );
  }

  return (
    <div className="meeting-room">
      {/* Participants Panel */}
      <div className="participants-panel">
        <h3 style={{ color: 'white', marginBottom: '1rem' }}>
          Participants ({participants.length})
        </h3>
        {participants.map((participant, index) => (
          <div key={index} className="participant-item">
            <div className="participant-name">
              {participant.name}
              {participant.isHost && <span className="host-badge">HOST</span>}
            </div>
            <div className="participant-status">
              {participant.isHost ? 'Broadcasting' : 'Listening'}
            </div>
          </div>
        ))}
      </div>

      {/* Host Video Container */}
      <div className="host-video-container">
        {isHost ? (
          <video
            ref={localVideoRef}
            className="host-video"
            autoPlay
            muted
            playsInline
          />
        ) : remoteStream ? (
          <video
            ref={remoteVideoRef}
            className="host-video"
            autoPlay
            playsInline
            onLoadedMetadata={() => {
              if (remoteVideoRef.current) {
                remoteVideoRef.current.srcObject = remoteStream;
              }
            }}
          />
        ) : (
          <div className="no-video">
            <p>Waiting for host to start streaming...</p>
          </div>
        )}

        {/* Host Controls */}
        {isHost && (
          <div className="host-controls">
            <button
              className={`control-button audio ${isAudioMuted ? 'muted' : ''}`}
              onClick={toggleAudio}
              title={isAudioMuted ? 'Unmute Audio' : 'Mute Audio'}
            >
              {isAudioMuted ? '🔇' : '🎤'}
            </button>

            <button
              className={`control-button video ${isVideoMuted ? 'muted' : ''}`}
              onClick={toggleVideo}
              title={isVideoMuted ? 'Turn On Video' : 'Turn Off Video'}
            >
              {isVideoMuted ? '📷' : '📹'}
            </button>

            <button
              className={`control-button screen-share ${isScreenSharing ? 'active' : ''}`}
              onClick={shareScreen}
              disabled={isScreenSharing}
              title="Share Screen"
            >
              📺
            </button>

            <button
              className="control-button end"
              onClick={endMeeting}
              title="End Meeting"
            >
              📞
            </button>
          </div>
        )}

        {/* Participant Leave Button */}
        {!isHost && (
          <div className="host-controls">
            <button
              className="control-button end"
              onClick={endMeeting}
              title="Leave Meeting"
            >
              🚪
            </button>
          </div>
        )}
      </div>

      {/* Chat Panel */}
      <div className="chat-panel">
        <h3 style={{ color: 'white', marginBottom: '1rem' }}>Chat</h3>
        
        <div className="chat-messages" ref={chatMessagesRef}>
          {chatMessages.map((message, index) => (
            <div key={index} className="message">
              <div className="message-sender">{message.senderName}</div>
              <div className="message-text">{message.message}</div>
              <div className="message-time">{formatTime(message.timestamp)}</div>
            </div>
          ))}
          {chatMessages.length === 0 && (
            <div style={{ color: '#a0aec0', textAlign: 'center', padding: '1rem' }}>
              No messages yet. Start the conversation!
            </div>
          )}
        </div>

        <form onSubmit={handleSendMessage} className="chat-input-container">
          <input
            type="text"
            className="chat-input"
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            placeholder="Type a message..."
            maxLength={500}
          />
          <button 
            type="submit" 
            className="send-button"
            disabled={!newMessage.trim()}
          >
            Send
          </button>
        </form>
      </div>
    </div>
  );
};

export default MeetingRoom;