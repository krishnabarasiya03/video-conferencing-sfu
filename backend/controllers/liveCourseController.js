/**
 * Live Course controller - handles live course-related API endpoints
 */

const { getAllLiveCourses } = require('../services/firebaseService');

/**
 * Get all live courses from Firebase
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
const getLiveCoursesController = async (req, res) => {
    try {
        const liveCourses = await getAllLiveCourses();
        
        res.json({
            success: true,
            data: liveCourses,
            count: liveCourses.length
        });
    } catch (error) {
        console.error('Error in getLiveCoursesController:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch live courses'
        });
    }
};

module.exports = {
    getLiveCoursesController
};