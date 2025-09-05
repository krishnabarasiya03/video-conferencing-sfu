/**
 * Utility functions for the video conferencing application
 */

/**
 * Generate a 6-digit meeting code
 * @returns {string} 6-digit meeting code
 */
function generateMeetingCode() {
    return Math.floor(100000 + Math.random() * 900000).toString();
}

module.exports = {
    generateMeetingCode
};