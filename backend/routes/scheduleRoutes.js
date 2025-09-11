/**
 * Schedule routes - API endpoints for schedule operations
 */

const express = require('express');
const router = express.Router();
const { 
    getMeetingScheduleController, 
    getUserScheduleController 
} = require('../controllers/scheduleController');

// API endpoint to get meeting schedule for a specific course and user
router.get('/meeting-schedule/:courseId', getMeetingScheduleController);

// API endpoint to get user's complete schedule
router.get('/user-schedule/:userId', getUserScheduleController);

module.exports = router;