const Meeting = require('../models/Meeting');
const mediasoupManager = require('../services/mediasoupManager');

const socketHandler = (io) => {
  io.on('connection', (socket) => {
    console.log('User connected:', socket.id);

    // Join meeting
    socket.on('join-meeting', async (data) => {
      try {
        const { meetingCode, userName, isHost } = data;
        
        // Find the meeting
        const meeting = await Meeting.findOne({ meetingCode });
        if (!meeting) {
          socket.emit('error', { message: 'Meeting not found' });
          return;
        }

        // Check if meeting is scheduled for the future
        const now = new Date();
        if (meeting.scheduledTime > now && !isHost) {
          socket.emit('error', { message: 'Meeting is not yet started' });
          return;
        }

        // Join socket room
        socket.join(meetingCode);

        // Add participant to meeting
        const participant = {
          name: userName,
          socketId: socket.id,
          isHost: isHost || false,
          joinedAt: new Date()
        };

        // Update meeting with participant
        if (isHost) {
          meeting.hostSocketId = socket.id;
          meeting.isActive = true;
        }

        meeting.participants.push(participant);
        await meeting.save();

        // Create MediaSoup router for the meeting if it doesn't exist
        await mediasoupManager.createMeetingRouter(meetingCode);

        // Get router RTP capabilities
        const rtpCapabilities = mediasoupManager.getRouterRtpCapabilities(meetingCode);

        // Send success response
        socket.emit('joined-meeting', {
          meetingCode,
          participants: meeting.participants,
          chatMessages: meeting.chatMessages,
          rtpCapabilities,
          isHost: isHost || false
        });

        // Notify other participants
        socket.to(meetingCode).emit('participant-joined', {
          participant: {
            name: userName,
            socketId: socket.id,
            isHost: isHost || false
          }
        });

        console.log(`${userName} joined meeting ${meetingCode} as ${isHost ? 'host' : 'participant'}`);

      } catch (error) {
        console.error('Error joining meeting:', error);
        socket.emit('error', { message: 'Failed to join meeting' });
      }
    });

    // Create WebRTC transport
    socket.on('create-transport', async (data) => {
      try {
        const { meetingCode } = data;
        
        const transportParams = await mediasoupManager.createWebRtcTransport(
          meetingCode, 
          socket.id
        );
        
        socket.emit('transport-created', transportParams);
      } catch (error) {
        console.error('Error creating transport:', error);
        socket.emit('error', { message: 'Failed to create transport' });
      }
    });

    // Connect transport
    socket.on('connect-transport', async (data) => {
      try {
        const { meetingCode, dtlsParameters } = data;
        
        await mediasoupManager.connectTransport(
          meetingCode,
          socket.id,
          dtlsParameters
        );
        
        socket.emit('transport-connected');
      } catch (error) {
        console.error('Error connecting transport:', error);
        socket.emit('error', { message: 'Failed to connect transport' });
      }
    });

    // Create producer (only for host)
    socket.on('create-producer', async (data) => {
      try {
        const { meetingCode, rtpParameters, kind } = data;
        
        // Check if user is host
        const meeting = await Meeting.findOne({ meetingCode, hostSocketId: socket.id });
        if (!meeting) {
          socket.emit('error', { message: 'Only host can produce media' });
          return;
        }

        const producer = await mediasoupManager.createProducer(
          meetingCode,
          socket.id,
          rtpParameters,
          kind
        );
        
        socket.emit('producer-created', producer);

        // Notify other participants about new producer
        socket.to(meetingCode).emit('new-producer', {
          producerId: producer.id,
          kind: producer.kind,
          socketId: socket.id
        });

      } catch (error) {
        console.error('Error creating producer:', error);
        socket.emit('error', { message: 'Failed to create producer' });
      }
    });

    // Create consumer
    socket.on('create-consumer', async (data) => {
      try {
        const { meetingCode, producerId, rtpCapabilities } = data;
        
        const consumer = await mediasoupManager.createConsumer(
          meetingCode,
          socket.id,
          producerId,
          rtpCapabilities
        );
        
        socket.emit('consumer-created', consumer);
      } catch (error) {
        console.error('Error creating consumer:', error);
        socket.emit('error', { message: 'Failed to create consumer' });
      }
    });

    // Resume consumer
    socket.on('resume-consumer', async (data) => {
      try {
        const { meetingCode, consumerId } = data;
        
        await mediasoupManager.resumeConsumer(meetingCode, consumerId);
        socket.emit('consumer-resumed');
      } catch (error) {
        console.error('Error resuming consumer:', error);
        socket.emit('error', { message: 'Failed to resume consumer' });
      }
    });

    // Send chat message
    socket.on('send-message', async (data) => {
      try {
        const { meetingCode, message, senderName } = data;
        
        const meeting = await Meeting.findOne({ meetingCode });
        if (!meeting) {
          socket.emit('error', { message: 'Meeting not found' });
          return;
        }

        const chatMessage = {
          senderName,
          message,
          timestamp: new Date()
        };

        meeting.chatMessages.push(chatMessage);
        await meeting.save();

        // Broadcast message to all participants
        io.to(meetingCode).emit('new-message', chatMessage);

      } catch (error) {
        console.error('Error sending message:', error);
        socket.emit('error', { message: 'Failed to send message' });
      }
    });

    // Mute/unmute audio
    socket.on('toggle-audio', async (data) => {
      try {
        const { meetingCode, muted } = data;
        
        // Only host can toggle their audio
        const meeting = await Meeting.findOne({ meetingCode, hostSocketId: socket.id });
        if (!meeting) {
          socket.emit('error', { message: 'Only host can toggle audio' });
          return;
        }

        // Notify participants about audio status
        socket.to(meetingCode).emit('host-audio-toggled', { muted });

      } catch (error) {
        console.error('Error toggling audio:', error);
        socket.emit('error', { message: 'Failed to toggle audio' });
      }
    });

    // Mute/unmute video
    socket.on('toggle-video', async (data) => {
      try {
        const { meetingCode, muted } = data;
        
        // Only host can toggle their video
        const meeting = await Meeting.findOne({ meetingCode, hostSocketId: socket.id });
        if (!meeting) {
          socket.emit('error', { message: 'Only host can toggle video' });
          return;
        }

        // Notify participants about video status
        socket.to(meetingCode).emit('host-video-toggled', { muted });

      } catch (error) {
        console.error('Error toggling video:', error);
        socket.emit('error', { message: 'Failed to toggle video' });
      }
    });

    // End meeting
    socket.on('end-meeting', async (data) => {
      try {
        const { meetingCode } = data;
        
        // Only host can end meeting
        const meeting = await Meeting.findOne({ meetingCode, hostSocketId: socket.id });
        if (!meeting) {
          socket.emit('error', { message: 'Only host can end meeting' });
          return;
        }

        // Update meeting status
        meeting.isActive = false;
        meeting.endedAt = new Date();
        meeting.participants = [];
        await meeting.save();

        // Notify all participants
        io.to(meetingCode).emit('meeting-ended');

        // Close MediaSoup resources
        mediasoupManager.closeMeeting(meetingCode);

        console.log(`Meeting ${meetingCode} ended by host`);

      } catch (error) {
        console.error('Error ending meeting:', error);
        socket.emit('error', { message: 'Failed to end meeting' });
      }
    });

    // Handle disconnect
    socket.on('disconnect', async () => {
      try {
        console.log('User disconnected:', socket.id);

        // Find meetings where this socket was a participant
        const meetings = await Meeting.find({
          'participants.socketId': socket.id,
          isActive: true
        });

        for (const meeting of meetings) {
          // Remove participant from meeting
          meeting.participants = meeting.participants.filter(
            p => p.socketId !== socket.id
          );

          // If disconnected user was host, end the meeting
          if (meeting.hostSocketId === socket.id) {
            meeting.isActive = false;
            meeting.endedAt = new Date();
            meeting.participants = [];
            
            // Notify all participants that meeting ended
            socket.to(meeting.meetingCode).emit('meeting-ended');
            
            // Close MediaSoup resources
            mediasoupManager.closeMeeting(meeting.meetingCode);
            
            console.log(`Meeting ${meeting.meetingCode} ended due to host disconnect`);
          } else {
            // Notify other participants about participant leaving
            socket.to(meeting.meetingCode).emit('participant-left', {
              socketId: socket.id
            });
          }

          await meeting.save();

          // Remove participant from MediaSoup
          mediasoupManager.removeParticipant(meeting.meetingCode, socket.id);
        }

      } catch (error) {
        console.error('Error handling disconnect:', error);
      }
    });
  });
};

module.exports = socketHandler;