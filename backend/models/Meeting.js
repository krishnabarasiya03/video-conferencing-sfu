const mongoose = require('mongoose');

const participantSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
  socketId: {
    type: String,
    required: true
  },
  joinedAt: {
    type: Date,
    default: Date.now
  },
  isHost: {
    type: Boolean,
    default: false
  }
});

const meetingSchema = new mongoose.Schema({
  meetingCode: {
    type: String,
    required: true,
    unique: true,
    trim: true
  },
  hostName: {
    type: String,
    required: true,
    trim: true
  },
  hostSocketId: {
    type: String,
    required: true
  },
  title: {
    type: String,
    required: true,
    trim: true
  },
  scheduledTime: {
    type: Date,
    required: true
  },
  duration: {
    type: Number, // in minutes
    default: 60
  },
  isActive: {
    type: Boolean,
    default: false
  },
  participants: [participantSchema],
  createdAt: {
    type: Date,
    default: Date.now
  },
  endedAt: {
    type: Date,
    default: null
  },
  chatMessages: [{
    senderName: String,
    message: String,
    timestamp: {
      type: Date,
      default: Date.now
    }
  }]
});

// Index for better query performance
meetingSchema.index({ meetingCode: 1 });
meetingSchema.index({ hostSocketId: 1 });
meetingSchema.index({ scheduledTime: 1 });

module.exports = mongoose.model('Meeting', meetingSchema);