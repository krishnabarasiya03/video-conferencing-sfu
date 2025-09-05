/**
 * Socket.IO configuration
 */

const socketIo = require('socket.io');

/**
 * Initialize Socket.IO server
 * @param {Object} server - HTTP server instance
 * @returns {Object} Socket.IO server instance
 */
const initializeSocket = (server) => {
    const io = socketIo(server, {
        cors: {
            origin: "*",
            methods: ["GET", "POST"]
        }
    });
    
    return io;
};

module.exports = {
    initializeSocket
};