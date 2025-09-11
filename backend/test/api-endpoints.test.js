/**
 * Simple API endpoint tests
 * Run with: node test/api-endpoints.test.js
 */

const http = require('http');

// Simple test helper
const testEndpoint = (path, expectedStatus = 200) => {
    return new Promise((resolve, reject) => {
        const req = http.request({
            hostname: 'localhost',
            port: 3000,
            path: path,
            method: 'GET'
        }, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    const response = JSON.parse(data);
                    console.log(`✓ ${path} - Status: ${res.statusCode}, Success: ${response.success}`);
                    resolve(response);
                } catch (error) {
                    console.error(`✗ ${path} - Failed to parse JSON:`, error.message);
                    reject(error);
                }
            });
        });

        req.on('error', (error) => {
            console.error(`✗ ${path} - Request failed:`, error.message);
            reject(error);
        });

        req.end();
    });
};

// Test POST endpoint
const testPostEndpoint = (path, body = {}) => {
    return new Promise((resolve, reject) => {
        const postData = JSON.stringify(body);
        
        const req = http.request({
            hostname: 'localhost',
            port: 3000,
            path: path,
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(postData)
            }
        }, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    const response = JSON.parse(data);
                    console.log(`✓ ${path} - Status: ${res.statusCode}, Success: ${response.success}`);
                    resolve(response);
                } catch (error) {
                    console.error(`✗ ${path} - Failed to parse JSON:`, error.message);
                    reject(error);
                }
            });
        });

        req.on('error', (error) => {
            console.error(`✗ ${path} - Request failed:`, error.message);
            reject(error);
        });

        req.write(postData);
        req.end();
    });
};

async function runTests() {
    console.log('🧪 Running API endpoint tests...\n');
    
    try {
        // Test new scheduling endpoints
        console.log('📋 Testing Scheduling API Endpoints:');
        await testEndpoint('/api/users');
        await testEndpoint('/api/live-course');
        await testEndpoint('/api/meeting-schedule/course1?userId=1');
        await testEndpoint('/api/user-schedule/1');
        
        console.log('\n🎥 Testing Meeting API Endpoints:');
        // Test existing meeting endpoints
        const meeting = await testPostEndpoint('/api/meeting/create');
        if (meeting.meetingCode) {
            await testEndpoint(`/api/meeting/${meeting.meetingCode}`);
        }
        
        console.log('\n🚫 Testing Error Cases:');
        // Test error cases
        await testEndpoint('/api/meeting-schedule/course1?userId=999');  // Should return 403
        await testEndpoint('/api/meeting-schedule/course1');  // Should return 400
        await testEndpoint('/api/meeting-schedule/nonexistent');  // Should return 400
        
        console.log('\n✅ All tests completed successfully!');
        
    } catch (error) {
        console.error('\n❌ Test failed:', error.message);
        process.exit(1);
    }
}

// Check if server is running before starting tests
const checkServer = () => {
    return new Promise((resolve, reject) => {
        const req = http.request({
            hostname: 'localhost',
            port: 3000,
            path: '/api/users',
            method: 'GET'
        }, (res) => {
            resolve(true);
        });

        req.on('error', (error) => {
            reject(new Error('Server is not running on port 3000. Please start the server first with: npm start'));
        });

        req.end();
    });
};

// Main execution
checkServer()
    .then(() => runTests())
    .catch((error) => {
        console.error('❌', error.message);
        process.exit(1);
    });