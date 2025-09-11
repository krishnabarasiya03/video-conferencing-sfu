/**
 * Schedule controller - handles meeting schedule-related API endpoints
 */

const { getLiveCourseById, getUserEnrolledCourses } = require('../services/firebaseService');

/**
 * Get meeting schedule for a specific course and user
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
const getMeetingScheduleController = async (req, res) => {
    try {
        const { courseId } = req.params;
        const { userId } = req.query;
        
        // Validate required parameters
        if (!courseId) {
            return res.status(400).json({
                success: false,
                error: 'Course ID is required'
            });
        }
        
        if (!userId) {
            return res.status(400).json({
                success: false,
                error: 'User ID is required as query parameter'
            });
        }
        
        // Get the course data
        const course = await getLiveCourseById(courseId);
        
        if (!course) {
            return res.status(404).json({
                success: false,
                error: 'Course not found'
            });
        }
        
        // Check if user is enrolled in the course
        if (!course.enrolledUser || !course.enrolledUser.includes(userId)) {
            return res.status(403).json({
                success: false,
                error: 'User is not enrolled in this course'
            });
        }
        
        // Return the schedule data
        res.json({
            success: true,
            data: {
                courseId: course.id,
                courseTitle: course.title,
                instructor: course.instructor,
                scheduleDateTime: course.scheduleDateTime,
                description: course.description
            }
        });
        
    } catch (error) {
        console.error('Error in getMeetingScheduleController:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch meeting schedule'
        });
    }
};

/**
 * Get user's complete schedule (all enrolled courses)
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
const getUserScheduleController = async (req, res) => {
    try {
        const { userId } = req.params;
        
        // Validate required parameter
        if (!userId) {
            return res.status(400).json({
                success: false,
                error: 'User ID is required'
            });
        }
        
        // Get all courses the user is enrolled in
        const enrolledCourses = await getUserEnrolledCourses(userId);
        
        // Format the schedule data for frontend use
        const scheduleData = enrolledCourses.map(course => ({
            courseId: course.id,
            courseTitle: course.title,
            instructor: course.instructor,
            scheduleDateTime: course.scheduleDateTime,
            description: course.description
        }));
        
        res.json({
            success: true,
            data: {
                userId: userId,
                enrolledCourses: scheduleData,
                totalCourses: scheduleData.length
            }
        });
        
    } catch (error) {
        console.error('Error in getUserScheduleController:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch user schedule'
        });
    }
};

module.exports = {
    getMeetingScheduleController,
    getUserScheduleController
};