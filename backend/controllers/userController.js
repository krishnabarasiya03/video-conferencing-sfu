/**
 * User controller - handles user-related API endpoints
 */

const { getAllUsers } = require('../services/firebaseService');

/**
 * Get all users from Firebase
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
const getUsersController = async (req, res) => {
    try {
        const users = await getAllUsers();
        
        res.json({
            success: true,
            data: users,
            count: users.length
        });
    } catch (error) {
        console.error('Error in getUsersController:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch users'
        });
    }
};

module.exports = {
    getUsersController
};