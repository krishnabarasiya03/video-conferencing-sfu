/**
 * Live Course routes - API endpoints for live course operations
 */

const express = require('express');
const router = express.Router();
const { getLiveCoursesController } = require('../controllers/liveCourseController');

// API endpoint to get all live courses
router.get('/', getLiveCoursesController);

module.exports = router;