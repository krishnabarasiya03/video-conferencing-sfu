/**
 * User routes - API endpoints for user operations
 */

const express = require('express');
const router = express.Router();
const { getUsersController } = require('../controllers/userController');

// API endpoint to get all users
router.get('/', getUsersController);

module.exports = router;