/**
 * Meeting controller - handles meeting-related business logic
 */

const { v4: uuidv4 } = require('uuid');
const { generateMeetingCode } = require('../utils/helpers');
const { createMeeting, getMeetingByCode } = require('../models/Meeting');

/**
 * Create a new meeting
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
const createMeetingController = (req, res) => {
    try {
        const meetingCode = generateMeetingCode();
        const meetingId = uuidv4();
        
        const meetingRoom = createMeeting(meetingId, meetingCode);
        
        res.json({
            success: true,
            meetingCode: meetingCode,
            meetingId: meetingId
        });
    } catch (error) {
        console.error('Error creating meeting:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to create meeting'
        });
    }
};

/**
 * Join an existing meeting
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
const joinMeetingController = (req, res) => {
    try {
        const { meetingCode } = req.body;
        
        if (!meetingCode) {
            return res.status(400).json({
                success: false,
                error: 'Meeting code is required'
            });
        }
        
        const meetingRoom = getMeetingByCode(meetingCode);
        
        if (!meetingRoom) {
            return res.status(404).json({
                success: false,
                error: 'Meeting not found'
            });
        }
        
        res.json({
            success: true,
            meetingId: meetingRoom.id,
            meetingCode: meetingCode
        });
    } catch (error) {
        console.error('Error joining meeting:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to join meeting'
        });
    }
};

/**
 * Get meeting information by code
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
const getMeetingInfoController = (req, res) => {
    try {
        const { code } = req.params;
        const meetingRoom = getMeetingByCode(code);
        
        if (!meetingRoom) {
            return res.status(404).json({
                success: false,
                error: 'Meeting not found'
            });
        }
        
        res.json({
            success: true,
            meeting: {
                id: meetingRoom.id,
                code: meetingRoom.code,
                participantCount: meetingRoom.participants.size,
                hasHost: meetingRoom.host !== null
            }
        });
    } catch (error) {
        console.error('Error getting meeting info:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to get meeting information'
        });
    }
};

module.exports = {
    createMeetingController,
    joinMeetingController,
    getMeetingInfoController
};