/**
 * Meeting routes - API endpoints for meeting operations
 */

const express = require('express');
const router = express.Router();
const {
    createMeetingController,
    joinMeetingController,
    getMeetingInfoController
} = require('../controllers/meetingController');

// API endpoint to create a new meeting
router.post('/create', createMeetingController);

// API endpoint to join a meeting
router.post('/join', joinMeetingController);

// API endpoint to get meeting info
router.get('/:code', getMeetingInfoController);

module.exports = router;