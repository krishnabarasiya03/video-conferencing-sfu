/**
 * Firebase service layer for data operations
 */

const { getFirestore } = require('../config/firebase');

// Mock data for when Firebase is not available
const mockUsers = [
    { id: '1', name: 'John Doe', email: 'john@example.com', role: 'student' },
    { id: '2', name: 'Jane Smith', email: 'jane@example.com', role: 'instructor' },
    { id: '3', name: 'Bob Johnson', email: 'bob@example.com', role: 'student' }
];

const mockLiveCourses = [
    {
        id: 'course1',
        title: 'Introduction to JavaScript',
        instructor: 'Jane Smith',
        enrolledUser: ['1', '3'], // Array of user IDs
        scheduleDateTime: {
            startDate: '2024-01-15T10:00:00Z',
            endDate: '2024-01-15T12:00:00Z',
            recurring: 'weekly',
            timezone: 'UTC'
        },
        description: 'Learn the basics of JavaScript programming'
    },
    {
        id: 'course2', 
        title: 'Advanced Node.js',
        instructor: 'Jane Smith',
        enrolledUser: ['2'], // Array of user IDs
        scheduleDateTime: {
            startDate: '2024-01-16T14:00:00Z',
            endDate: '2024-01-16T16:00:00Z',
            recurring: 'weekly',
            timezone: 'UTC'
        },
        description: 'Advanced concepts in Node.js development'
    },
    {
        id: 'course3',
        title: 'React Fundamentals',
        instructor: 'John Doe',
        enrolledUser: ['1', '2', '3'], // Array of user IDs
        scheduleDateTime: {
            startDate: '2024-01-17T09:00:00Z',
            endDate: '2024-01-17T11:00:00Z',
            recurring: 'bi-weekly',
            timezone: 'UTC'
        },
        description: 'Learn React.js from scratch'
    }
];

/**
 * Get all users from Firebase or mock data
 * @returns {Promise<Array>} Array of user objects
 */
async function getAllUsers() {
    try {
        const db = getFirestore();
        
        if (db) {
            // Firebase implementation
            const usersCollection = await db.collection('users').get();
            const users = [];
            usersCollection.forEach(doc => {
                users.push({ id: doc.id, ...doc.data() });
            });
            return users;
        } else {
            // Return mock data when Firebase is not available
            console.log('Using mock user data');
            return mockUsers;
        }
    } catch (error) {
        console.error('Error fetching users:', error);
        // Fallback to mock data on error
        return mockUsers;
    }
}

/**
 * Get all live courses from Firebase or mock data
 * @returns {Promise<Array>} Array of live course objects
 */
async function getAllLiveCourses() {
    try {
        const db = getFirestore();
        
        if (db) {
            // Firebase implementation
            const coursesCollection = await db.collection('live-courses').get();
            const courses = [];
            coursesCollection.forEach(doc => {
                courses.push({ id: doc.id, ...doc.data() });
            });
            return courses;
        } else {
            // Return mock data when Firebase is not available
            console.log('Using mock live course data');
            return mockLiveCourses;
        }
    } catch (error) {
        console.error('Error fetching live courses:', error);
        // Fallback to mock data on error
        return mockLiveCourses;
    }
}

/**
 * Get live course by ID
 * @param {string} courseId - Course ID
 * @returns {Promise<Object|null>} Course object or null if not found
 */
async function getLiveCourseById(courseId) {
    try {
        const db = getFirestore();
        
        if (db) {
            // Firebase implementation
            const courseDoc = await db.collection('live-courses').doc(courseId).get();
            if (courseDoc.exists) {
                return { id: courseDoc.id, ...courseDoc.data() };
            }
            return null;
        } else {
            // Use mock data
            console.log('Using mock data for course lookup');
            return mockLiveCourses.find(course => course.id === courseId) || null;
        }
    } catch (error) {
        console.error('Error fetching course by ID:', error);
        // Fallback to mock data on error
        return mockLiveCourses.find(course => course.id === courseId) || null;
    }
}

/**
 * Get user's enrolled courses
 * @param {string} userId - User ID
 * @returns {Promise<Array>} Array of courses the user is enrolled in
 */
async function getUserEnrolledCourses(userId) {
    try {
        const allCourses = await getAllLiveCourses();
        // Filter courses where user is enrolled
        return allCourses.filter(course => 
            course.enrolledUser && course.enrolledUser.includes(userId)
        );
    } catch (error) {
        console.error('Error fetching user enrolled courses:', error);
        return [];
    }
}

module.exports = {
    getAllUsers,
    getAllLiveCourses,
    getLiveCourseById,
    getUserEnrolledCourses
};