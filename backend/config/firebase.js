/**
 * Firebase configuration and initialization
 */

const admin = require('firebase-admin');

// Initialize Firebase Admin SDK
// Note: For production, use service account key file or application default credentials
// For this implementation, we'll use a mock configuration that can be replaced with actual Firebase config
const initializeFirebase = () => {
    try {
        // Check if Firebase is already initialized
        if (admin.apps.length === 0) {
            // For development/demo purposes, we'll create a mock Firebase setup
            // In production, replace this with actual Firebase service account configuration
            const serviceAccount = {
                type: "service_account",
                project_id: "video-conferencing-demo",
                // Add your actual Firebase service account details here
            };

            // Initialize Firebase with mock config for demo
            // In production, use actual service account key
            admin.initializeApp({
                credential: admin.credential.cert(serviceAccount || {}),
                databaseURL: process.env.FIREBASE_DATABASE_URL || "https://video-conferencing-demo-default-rtdb.firebaseio.com/"
            });
        }
        
        console.log('Firebase Admin SDK initialized successfully');
        return admin;
    } catch (error) {
        console.warn('Firebase initialization failed, using mock data:', error.message);
        // Return null to indicate Firebase is not available, services will use mock data
        return null;
    }
};

// Get Firestore database instance
const getFirestore = () => {
    try {
        const firebaseAdmin = initializeFirebase();
        return firebaseAdmin ? firebaseAdmin.firestore() : null;
    } catch (error) {
        console.warn('Firestore not available, using mock data');
        return null;
    }
};

module.exports = {
    initializeFirebase,
    getFirestore,
    admin
};