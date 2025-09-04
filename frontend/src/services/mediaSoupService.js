import { Device } from 'mediasoup-client';
import socketService from './socketService';

class MediaSoupService {
  constructor() {
    this.device = null;
    this.sendTransport = null;
    this.recvTransport = null;
    this.videoProducer = null;
    this.audioProducer = null;
    this.consumers = new Map();
    this.isProducing = false;
  }

  async initializeDevice(rtpCapabilities) {
    try {
      this.device = new Device();
      await this.device.load({ routerRtpCapabilities: rtpCapabilities });
      console.log('MediaSoup device loaded successfully');
      return true;
    } catch (error) {
      console.error('Failed to load MediaSoup device:', error);
      return false;
    }
  }

  async createSendTransport(meetingCode) {
    return new Promise((resolve, reject) => {
      socketService.createTransport(meetingCode);

      const handleTransportCreated = (params) => {
        this.createWebRtcSendTransport(params, meetingCode)
          .then(resolve)
          .catch(reject);
        socketService.off('transport-created', handleTransportCreated);
      };

      const handleError = (error) => {
        socketService.off('error', handleError);
        reject(error);
      };

      socketService.on('transport-created', handleTransportCreated);
      socketService.on('error', handleError);
    });
  }

  async createWebRtcSendTransport(params, meetingCode) {
    try {
      this.sendTransport = this.device.createSendTransport(params);

      this.sendTransport.on('connect', async ({ dtlsParameters }, callback, errback) => {
        try {
          socketService.connectTransport(meetingCode, dtlsParameters);
          
          const handleConnected = () => {
            callback();
            socketService.off('transport-connected', handleConnected);
          };

          socketService.on('transport-connected', handleConnected);
        } catch (error) {
          errback(error);
        }
      });

      this.sendTransport.on('produce', async (parameters, callback, errback) => {
        try {
          const { kind, rtpParameters } = parameters;
          socketService.createProducer(meetingCode, rtpParameters, kind);

          const handleProducerCreated = (response) => {
            callback({ id: response.id });
            socketService.off('producer-created', handleProducerCreated);
          };

          socketService.on('producer-created', handleProducerCreated);
        } catch (error) {
          errback(error);
        }
      });

      return this.sendTransport;
    } catch (error) {
      console.error('Failed to create send transport:', error);
      throw error;
    }
  }

  async createRecvTransport(meetingCode) {
    return new Promise((resolve, reject) => {
      socketService.createTransport(meetingCode);

      const handleTransportCreated = (params) => {
        this.createWebRtcRecvTransport(params, meetingCode)
          .then(resolve)
          .catch(reject);
        socketService.off('transport-created', handleTransportCreated);
      };

      const handleError = (error) => {
        socketService.off('error', handleError);
        reject(error);
      };

      socketService.on('transport-created', handleTransportCreated);
      socketService.on('error', handleError);
    });
  }

  async createWebRtcRecvTransport(params, meetingCode) {
    try {
      this.recvTransport = this.device.createRecvTransport(params);

      this.recvTransport.on('connect', async ({ dtlsParameters }, callback, errback) => {
        try {
          socketService.connectTransport(meetingCode, dtlsParameters);
          
          const handleConnected = () => {
            callback();
            socketService.off('transport-connected', handleConnected);
          };

          socketService.on('transport-connected', handleConnected);
        } catch (error) {
          errback(error);
        }
      });

      return this.recvTransport;
    } catch (error) {
      console.error('Failed to create receive transport:', error);
      throw error;
    }
  }

  async startProducing(stream, meetingCode) {
    if (!this.sendTransport || this.isProducing) {
      return false;
    }

    try {
      this.isProducing = true;

      // Produce video
      const videoTrack = stream.getVideoTracks()[0];
      if (videoTrack) {
        this.videoProducer = await this.sendTransport.produce({
          track: videoTrack,
          codecOptions: {
            videoGoogleStartBitrate: 1000
          }
        });

        this.videoProducer.on('trackended', () => {
          console.log('Video track ended');
        });

        this.videoProducer.on('transportclose', () => {
          console.log('Video producer transport closed');
        });
      }

      // Produce audio
      const audioTrack = stream.getAudioTracks()[0];
      if (audioTrack) {
        this.audioProducer = await this.sendTransport.produce({
          track: audioTrack
        });

        this.audioProducer.on('trackended', () => {
          console.log('Audio track ended');
        });

        this.audioProducer.on('transportclose', () => {
          console.log('Audio producer transport closed');
        });
      }

      console.log('Started producing media');
      return true;
    } catch (error) {
      console.error('Failed to start producing:', error);
      this.isProducing = false;
      return false;
    }
  }

  async consumeMedia(producerId, meetingCode) {
    if (!this.recvTransport) {
      console.error('Receive transport not available');
      return null;
    }

    try {
      const rtpCapabilities = this.device.rtpCapabilities;
      
      return new Promise((resolve, reject) => {
        socketService.createConsumer(meetingCode, producerId, rtpCapabilities);

        const handleConsumerCreated = async (params) => {
          try {
            const consumer = await this.recvTransport.consume({
              id: params.id,
              producerId: params.producerId,
              kind: params.kind,
              rtpParameters: params.rtpParameters
            });

            this.consumers.set(consumer.id, consumer);

            consumer.on('transportclose', () => {
              console.log('Consumer transport closed');
              this.consumers.delete(consumer.id);
            });

            consumer.on('producerclose', () => {
              console.log('Consumer producer closed');
              this.consumers.delete(consumer.id);
            });

            // Resume consumer
            socketService.resumeConsumer(meetingCode, consumer.id);

            const handleConsumerResumed = () => {
              resolve(consumer);
              socketService.off('consumer-resumed', handleConsumerResumed);
            };

            socketService.on('consumer-resumed', handleConsumerResumed);
            socketService.off('consumer-created', handleConsumerCreated);
          } catch (error) {
            reject(error);
          }
        };

        const handleError = (error) => {
          socketService.off('error', handleError);
          reject(error);
        };

        socketService.on('consumer-created', handleConsumerCreated);
        socketService.on('error', handleError);
      });
    } catch (error) {
      console.error('Failed to consume media:', error);
      return null;
    }
  }

  pauseVideoProducer() {
    if (this.videoProducer) {
      this.videoProducer.pause();
    }
  }

  resumeVideoProducer() {
    if (this.videoProducer) {
      this.videoProducer.resume();
    }
  }

  pauseAudioProducer() {
    if (this.audioProducer) {
      this.audioProducer.pause();
    }
  }

  resumeAudioProducer() {
    if (this.audioProducer) {
      this.audioProducer.resume();
    }
  }

  closeProducers() {
    if (this.videoProducer) {
      this.videoProducer.close();
      this.videoProducer = null;
    }
    if (this.audioProducer) {
      this.audioProducer.close();
      this.audioProducer = null;
    }
    this.isProducing = false;
  }

  closeTransports() {
    if (this.sendTransport) {
      this.sendTransport.close();
      this.sendTransport = null;
    }
    if (this.recvTransport) {
      this.recvTransport.close();
      this.recvTransport = null;
    }
  }

  closeConsumers() {
    this.consumers.forEach(consumer => {
      consumer.close();
    });
    this.consumers.clear();
  }

  cleanup() {
    this.closeProducers();
    this.closeConsumers();
    this.closeTransports();
    this.device = null;
  }

  getRtpCapabilities() {
    return this.device?.rtpCapabilities;
  }

  isDeviceLoaded() {
    return this.device?.loaded || false;
  }
}

// Create singleton instance
const mediaSoupService = new MediaSoupService();

export default mediaSoupService;