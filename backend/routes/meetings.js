const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const Meeting = require('../models/Meeting');

// Create a new meeting (Host)
router.post('/create', async (req, res) => {
  try {
    const { hostName, title, scheduledTime, duration } = req.body;
    
    if (!hostName || !title || !scheduledTime) {
      return res.status(400).json({ 
        error: 'Host name, title, and scheduled time are required' 
      });
    }

    // Generate a unique meeting code
    let meetingCode;
    let isUnique = false;
    
    while (!isUnique) {
      meetingCode = Math.random().toString(36).substring(2, 8).toUpperCase();
      const existingMeeting = await Meeting.findOne({ meetingCode });
      if (!existingMeeting) {
        isUnique = true;
      }
    }

    const meeting = new Meeting({
      meetingCode,
      hostName,
      hostSocketId: '', // Will be set when host joins
      title,
      scheduledTime: new Date(scheduledTime),
      duration: duration || 60,
      participants: [],
      chatMessages: []
    });

    await meeting.save();

    res.status(201).json({
      message: 'Meeting created successfully',
      meeting: {
        meetingCode: meeting.meetingCode,
        title: meeting.title,
        scheduledTime: meeting.scheduledTime,
        duration: meeting.duration
      }
    });
  } catch (error) {
    console.error('Error creating meeting:', error);
    res.status(500).json({ error: 'Failed to create meeting' });
  }
});

// Get meeting by code
router.get('/:code', async (req, res) => {
  try {
    const { code } = req.params;
    
    const meeting = await Meeting.findOne({ meetingCode: code });
    
    if (!meeting) {
      return res.status(404).json({ error: 'Meeting not found' });
    }

    res.json({
      meetingCode: meeting.meetingCode,
      title: meeting.title,
      hostName: meeting.hostName,
      scheduledTime: meeting.scheduledTime,
      duration: meeting.duration,
      isActive: meeting.isActive,
      participantCount: meeting.participants.length
    });
  } catch (error) {
    console.error('Error fetching meeting:', error);
    res.status(500).json({ error: 'Failed to fetch meeting' });
  }
});

// Get all meetings for a participant (to show scheduled meetings)
router.get('/participant/list', async (req, res) => {
  try {
    const meetings = await Meeting.find({
      scheduledTime: { $gte: new Date() },
      isActive: false
    }).sort({ scheduledTime: 1 });

    const meetingList = meetings.map(meeting => ({
      meetingCode: meeting.meetingCode,
      title: meeting.title,
      hostName: meeting.hostName,
      scheduledTime: meeting.scheduledTime,
      duration: meeting.duration
    }));

    res.json(meetingList);
  } catch (error) {
    console.error('Error fetching meetings:', error);
    res.status(500).json({ error: 'Failed to fetch meetings' });
  }
});

// Update meeting status
router.patch('/:code/status', async (req, res) => {
  try {
    const { code } = req.params;
    const { isActive, hostSocketId } = req.body;
    
    const updateData = { isActive };
    if (hostSocketId) {
      updateData.hostSocketId = hostSocketId;
    }
    
    if (isActive === false) {
      updateData.endedAt = new Date();
    }

    const meeting = await Meeting.findOneAndUpdate(
      { meetingCode: code },
      updateData,
      { new: true }
    );

    if (!meeting) {
      return res.status(404).json({ error: 'Meeting not found' });
    }

    res.json({ message: 'Meeting status updated', meeting });
  } catch (error) {
    console.error('Error updating meeting:', error);
    res.status(500).json({ error: 'Failed to update meeting' });
  }
});

// Delete meeting
router.delete('/:code', async (req, res) => {
  try {
    const { code } = req.params;
    
    const meeting = await Meeting.findOneAndDelete({ meetingCode: code });
    
    if (!meeting) {
      return res.status(404).json({ error: 'Meeting not found' });
    }

    res.json({ message: 'Meeting deleted successfully' });
  } catch (error) {
    console.error('Error deleting meeting:', error);
    res.status(500).json({ error: 'Failed to delete meeting' });
  }
});

module.exports = router;