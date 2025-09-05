/**
 * Meeting data model and storage
 */

// Store meeting rooms with their codes (using Map for now, can be replaced with database later)
const meetingRooms = new Map();

/**
 * Meeting room structure
 */
class Meeting {
    constructor(id, code) {
        this.id = id;
        this.code = code;
        this.host = null;
        this.participants = new Set();
        this.createdAt = new Date();
    }
}

/**
 * Get all meeting rooms
 * @returns {Map} Meeting rooms map
 */
function getMeetingRooms() {
    return meetingRooms;
}

/**
 * Get meeting room by code
 * @param {string} code - Meeting code
 * @returns {Meeting|undefined} Meeting room or undefined if not found
 */
function getMeetingByCode(code) {
    return meetingRooms.get(code);
}

/**
 * Create new meeting room
 * @param {string} id - Meeting ID
 * @param {string} code - Meeting code
 * @returns {Meeting} Created meeting room
 */
function createMeeting(id, code) {
    const meeting = new Meeting(id, code);
    meetingRooms.set(code, meeting);
    return meeting;
}

module.exports = {
    Meeting,
    getMeetingRooms,
    getMeetingByCode,
    createMeeting
};