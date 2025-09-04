const mediasoup = require('mediasoup');

let worker;
let router;

const mediaCodecs = [
  {
    kind: 'audio',
    mimeType: 'audio/opus',
    clockRate: 48000,
    channels: 2,
  },
  {
    kind: 'video',
    mimeType: 'video/VP8',
    clockRate: 90000,
    parameters: {
      'x-google-start-bitrate': 1000,
    },
  },
  {
    kind: 'video',
    mimeType: 'video/h264',
    clockRate: 90000,
    parameters: {
      'packetization-mode': 1,
      'profile-level-id': '4d0032',
      'level-asymmetry-allowed': 1,
      'x-google-start-bitrate': 1000,
    },
  },
];

const webRtcTransportOptions = {
  listenIps: [
    {
      ip: '0.0.0.0',
      announcedIp: process.env.ANNOUNCED_IP || '127.0.0.1',
    },
  ],
  enableUdp: true,
  enableTcp: true,
  preferUdp: true,
};

class MediaSoupManager {
  constructor() {
    this.meetings = new Map(); // meetingCode -> { router, transports, producers, consumers }
  }

  async init() {
    try {
      // Create MediaSoup worker
      worker = await mediasoup.createWorker({
        rtcMinPort: 10000,
        rtcMaxPort: 10100,
      });

      worker.on('died', (error) => {
        console.error('MediaSoup worker died:', error);
        setTimeout(() => process.exit(1), 2000);
      });

      console.log('MediaSoup worker created successfully');
    } catch (error) {
      console.error('Failed to create MediaSoup worker:', error);
      throw error;
    }
  }

  async createMeetingRouter(meetingCode) {
    try {
      if (this.meetings.has(meetingCode)) {
        return this.meetings.get(meetingCode).router;
      }

      const router = await worker.createRouter({ mediaCodecs });
      
      const meetingData = {
        router,
        transports: new Map(),
        producers: new Map(),
        consumers: new Map(),
        participants: new Map()
      };

      this.meetings.set(meetingCode, meetingData);
      console.log(`Router created for meeting: ${meetingCode}`);
      
      return router;
    } catch (error) {
      console.error('Failed to create router:', error);
      throw error;
    }
  }

  async createWebRtcTransport(meetingCode, socketId) {
    try {
      const meetingData = this.meetings.get(meetingCode);
      if (!meetingData) {
        throw new Error('Meeting not found');
      }

      const transport = await meetingData.router.createWebRtcTransport({
        ...webRtcTransportOptions,
      });

      transport.on('dtlsstatechange', (dtlsState) => {
        if (dtlsState === 'closed') {
          transport.close();
        }
      });

      transport.on('close', () => {
        console.log('Transport closed');
      });

      meetingData.transports.set(socketId, transport);
      
      return {
        id: transport.id,
        iceParameters: transport.iceParameters,
        iceCandidates: transport.iceCandidates,
        dtlsParameters: transport.dtlsParameters,
      };
    } catch (error) {
      console.error('Failed to create WebRTC transport:', error);
      throw error;
    }
  }

  async connectTransport(meetingCode, socketId, dtlsParameters) {
    try {
      const meetingData = this.meetings.get(meetingCode);
      if (!meetingData) {
        throw new Error('Meeting not found');
      }

      const transport = meetingData.transports.get(socketId);
      if (!transport) {
        throw new Error('Transport not found');
      }

      await transport.connect({ dtlsParameters });
      console.log('Transport connected successfully');
    } catch (error) {
      console.error('Failed to connect transport:', error);
      throw error;
    }
  }

  async createProducer(meetingCode, socketId, rtpParameters, kind) {
    try {
      const meetingData = this.meetings.get(meetingCode);
      if (!meetingData) {
        throw new Error('Meeting not found');
      }

      const transport = meetingData.transports.get(socketId);
      if (!transport) {
        throw new Error('Transport not found');
      }

      const producer = await transport.produce({
        kind,
        rtpParameters,
      });

      producer.on('transportclose', () => {
        console.log('Producer transport closed');
      });

      meetingData.producers.set(producer.id, producer);
      
      // Store producer info for this participant
      if (!meetingData.participants.has(socketId)) {
        meetingData.participants.set(socketId, {});
      }
      
      const participant = meetingData.participants.get(socketId);
      if (kind === 'video') {
        participant.videoProducerId = producer.id;
      } else if (kind === 'audio') {
        participant.audioProducerId = producer.id;
      }

      return {
        id: producer.id,
        kind: producer.kind,
      };
    } catch (error) {
      console.error('Failed to create producer:', error);
      throw error;
    }
  }

  async createConsumer(meetingCode, socketId, producerId, rtpCapabilities) {
    try {
      const meetingData = this.meetings.get(meetingCode);
      if (!meetingData) {
        throw new Error('Meeting not found');
      }

      const router = meetingData.router;
      const transport = meetingData.transports.get(socketId);
      
      if (!transport) {
        throw new Error('Transport not found');
      }

      if (!router.canConsume({ producerId, rtpCapabilities })) {
        throw new Error('Cannot consume');
      }

      const consumer = await transport.consume({
        producerId,
        rtpCapabilities,
        paused: true,
      });

      consumer.on('transportclose', () => {
        console.log('Consumer transport closed');
      });

      consumer.on('producerclose', () => {
        console.log('Consumer producer closed');
      });

      meetingData.consumers.set(consumer.id, consumer);

      return {
        id: consumer.id,
        producerId,
        kind: consumer.kind,
        rtpParameters: consumer.rtpParameters,
        type: consumer.type,
        producerPaused: consumer.producerPaused,
      };
    } catch (error) {
      console.error('Failed to create consumer:', error);
      throw error;
    }
  }

  async resumeConsumer(meetingCode, consumerId) {
    try {
      const meetingData = this.meetings.get(meetingCode);
      if (!meetingData) {
        throw new Error('Meeting not found');
      }

      const consumer = meetingData.consumers.get(consumerId);
      if (!consumer) {
        throw new Error('Consumer not found');
      }

      await consumer.resume();
      console.log('Consumer resumed successfully');
    } catch (error) {
      console.error('Failed to resume consumer:', error);
      throw error;
    }
  }

  getRouterRtpCapabilities(meetingCode) {
    const meetingData = this.meetings.get(meetingCode);
    if (!meetingData) {
      throw new Error('Meeting not found');
    }
    return meetingData.router.rtpCapabilities;
  }

  getProducers(meetingCode, excludeSocketId = null) {
    const meetingData = this.meetings.get(meetingCode);
    if (!meetingData) {
      return [];
    }

    const producers = [];
    for (const [socketId, participant] of meetingData.participants.entries()) {
      if (socketId !== excludeSocketId) {
        if (participant.videoProducerId) {
          producers.push({
            id: participant.videoProducerId,
            kind: 'video',
            socketId
          });
        }
        if (participant.audioProducerId) {
          producers.push({
            id: participant.audioProducerId,
            kind: 'audio',
            socketId
          });
        }
      }
    }
    return producers;
  }

  closeMeeting(meetingCode) {
    const meetingData = this.meetings.get(meetingCode);
    if (meetingData) {
      // Close all transports
      for (const transport of meetingData.transports.values()) {
        transport.close();
      }
      
      // Close router
      meetingData.router.close();
      
      // Remove meeting data
      this.meetings.delete(meetingCode);
      console.log(`Meeting ${meetingCode} closed`);
    }
  }

  removeParticipant(meetingCode, socketId) {
    const meetingData = this.meetings.get(meetingCode);
    if (meetingData) {
      // Close transport
      const transport = meetingData.transports.get(socketId);
      if (transport) {
        transport.close();
        meetingData.transports.delete(socketId);
      }

      // Remove participant data
      meetingData.participants.delete(socketId);
      console.log(`Participant ${socketId} removed from meeting ${meetingCode}`);
    }
  }
}

module.exports = new MediaSoupManager();