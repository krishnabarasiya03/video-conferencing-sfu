import { io } from 'socket.io-client';

const SOCKET_URL = process.env.REACT_APP_SOCKET_URL || 'http://localhost:5000';

class SocketService {
  constructor() {
    this.socket = null;
    this.listeners = new Map();
  }

  connect() {
    if (!this.socket) {
      this.socket = io(SOCKET_URL, {
        transports: ['websocket'],
        upgrade: false
      });

      this.socket.on('connect', () => {
        console.log('Connected to server:', this.socket.id);
      });

      this.socket.on('disconnect', () => {
        console.log('Disconnected from server');
      });

      this.socket.on('error', (error) => {
        console.error('Socket error:', error);
      });
    }
    return this.socket;
  }

  disconnect() {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
      this.listeners.clear();
    }
  }

  // Meeting events
  joinMeeting(meetingCode, userName, isHost = false) {
    this.socket.emit('join-meeting', {
      meetingCode,
      userName,
      isHost
    });
  }

  sendMessage(meetingCode, message, senderName) {
    this.socket.emit('send-message', {
      meetingCode,
      message,
      senderName
    });
  }

  toggleAudio(meetingCode, muted) {
    this.socket.emit('toggle-audio', {
      meetingCode,
      muted
    });
  }

  toggleVideo(meetingCode, muted) {
    this.socket.emit('toggle-video', {
      meetingCode,
      muted
    });
  }

  endMeeting(meetingCode) {
    this.socket.emit('end-meeting', {
      meetingCode
    });
  }

  // MediaSoup events
  createTransport(meetingCode) {
    this.socket.emit('create-transport', {
      meetingCode
    });
  }

  connectTransport(meetingCode, dtlsParameters) {
    this.socket.emit('connect-transport', {
      meetingCode,
      dtlsParameters
    });
  }

  createProducer(meetingCode, rtpParameters, kind) {
    this.socket.emit('create-producer', {
      meetingCode,
      rtpParameters,
      kind
    });
  }

  createConsumer(meetingCode, producerId, rtpCapabilities) {
    this.socket.emit('create-consumer', {
      meetingCode,
      producerId,
      rtpCapabilities
    });
  }

  resumeConsumer(meetingCode, consumerId) {
    this.socket.emit('resume-consumer', {
      meetingCode,
      consumerId
    });
  }

  // Event listeners
  on(event, callback) {
    if (this.socket) {
      this.socket.on(event, callback);
      
      // Store callback reference for cleanup
      if (!this.listeners.has(event)) {
        this.listeners.set(event, []);
      }
      this.listeners.get(event).push(callback);
    }
  }

  off(event, callback) {
    if (this.socket) {
      this.socket.off(event, callback);
      
      // Remove from stored listeners
      if (this.listeners.has(event)) {
        const callbacks = this.listeners.get(event);
        const index = callbacks.indexOf(callback);
        if (index > -1) {
          callbacks.splice(index, 1);
        }
      }
    }
  }

  // Clean up all listeners for an event
  removeAllListeners(event) {
    if (this.socket) {
      this.socket.removeAllListeners(event);
      this.listeners.delete(event);
    }
  }

  getSocketId() {
    return this.socket?.id;
  }

  isConnected() {
    return this.socket?.connected || false;
  }
}

// Create singleton instance
const socketService = new SocketService();

export default socketService;