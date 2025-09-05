const express = require('express');
const http = require('http');
const cors = require('cors');
const path = require('path');

// Import configurations
const { initializeSocket } = require('./config/socket');

// Import routes
const meetingRoutes = require('./routes/meetingRoutes');

// Import controllers
const { handleSocketConnection } = require('./controllers/socketController');

const app = express();
const server = http.createServer(app);
const io = initializeSocket(server);

// Middleware
app.use(cors());
app.use(express.json());

// Serve static files
// Serve HTML files from frontend/public
app.use(express.static(path.join(__dirname, '../frontend/public')));
// Serve CSS and JS files from frontend/src
app.use(express.static(path.join(__dirname, '../frontend/src')));

// Routes
app.use('/api/meeting', meetingRoutes);

// Socket.IO connection handling
handleSocketConnection(io);

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});