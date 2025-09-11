# Video Conferencing Backend API Endpoints

This document describes the available API endpoints for the video conferencing backend with scheduling functionality.

## Existing Meeting Endpoints

### Create Meeting
- **Method**: `POST`
- **Route**: `/api/meeting/create`
- **Purpose**: Create a new meeting room and get a unique 6-digit code
- **Response**: 
  ```json
  {
    "success": true,
    "meetingCode": "123456",
    "meetingId": "uuid"
  }
  ```

### Join Meeting
- **Method**: `POST`
- **Route**: `/api/meeting/join`
- **Purpose**: Validate and join an existing meeting
- **Body**: `{ "meetingCode": "123456" }`
- **Response**:
  ```json
  {
    "success": true,
    "meetingId": "uuid",
    "meetingCode": "123456"
  }
  ```

### Get Meeting Info
- **Method**: `GET`
- **Route**: `/api/meeting/:code`
- **Purpose**: Get meeting information by code
- **Response**:
  ```json
  {
    "success": true,
    "meeting": {
      "id": "uuid",
      "code": "123456",
      "participantCount": 0,
      "hasHost": false
    }
  }
  ```

## New Scheduling API Endpoints

### A. User API
- **Method**: `GET`
- **Route**: `/api/users`
- **Purpose**: Fetch and return all user data from Firebase
- **Response**:
  ```json
  {
    "success": true,
    "data": [
      {
        "id": "1",
        "name": "John Doe",
        "email": "john@example.com",
        "role": "student"
      }
    ],
    "count": 1
  }
  ```

### B. Live Course API
- **Method**: `GET`
- **Route**: `/api/live-course`
- **Purpose**: Fetch and return all live course data from Firebase
- **Response**:
  ```json
  {
    "success": true,
    "data": [
      {
        "id": "course1",
        "title": "Introduction to JavaScript",
        "instructor": "Jane Smith",
        "enrolledUser": ["1", "3"],
        "scheduleDateTime": {
          "startDate": "2024-01-15T10:00:00Z",
          "endDate": "2024-01-15T12:00:00Z",
          "recurring": "weekly",
          "timezone": "UTC"
        },
        "description": "Learn the basics of JavaScript programming"
      }
    ],
    "count": 1
  }
  ```

### C. Meeting Schedule API
- **Method**: `GET`
- **Route**: `/api/meeting-schedule/:courseId?userId={userId}`
- **Purpose**: Get meeting schedule for enrolled users
- **Parameters**: 
  - `courseId` (path parameter): Course ID
  - `userId` (query parameter): User ID
- **Response** (when user is enrolled):
  ```json
  {
    "success": true,
    "data": {
      "courseId": "course1",
      "courseTitle": "Introduction to JavaScript",
      "instructor": "Jane Smith",
      "scheduleDateTime": {
        "startDate": "2024-01-15T10:00:00Z",
        "endDate": "2024-01-15T12:00:00Z",
        "recurring": "weekly",
        "timezone": "UTC"
      },
      "description": "Learn the basics of JavaScript programming"
    }
  }
  ```
- **Error Response** (when user is not enrolled):
  ```json
  {
    "success": false,
    "error": "User is not enrolled in this course"
  }
  ```

### D. User Schedule API
- **Method**: `GET`
- **Route**: `/api/user-schedule/:userId`
- **Purpose**: Get all courses and schedules for a specific user
- **Parameters**: 
  - `userId` (path parameter): User ID
- **Response**:
  ```json
  {
    "success": true,
    "data": {
      "userId": "1",
      "enrolledCourses": [
        {
          "courseId": "course1",
          "courseTitle": "Introduction to JavaScript",
          "instructor": "Jane Smith",
          "scheduleDateTime": {
            "startDate": "2024-01-15T10:00:00Z",
            "endDate": "2024-01-15T12:00:00Z",
            "recurring": "weekly",
            "timezone": "UTC"
          },
          "description": "Learn the basics of JavaScript programming"
        }
      ],
      "totalCourses": 1
    }
  }
  ```

## Error Handling

All endpoints include proper error handling with appropriate HTTP status codes:
- `400`: Bad Request (missing required parameters)
- `403`: Forbidden (user not enrolled in course)
- `404`: Not Found (course/meeting not found)
- `500`: Internal Server Error

## Firebase Integration

The backend integrates with Firebase Admin SDK for data storage. When Firebase is not configured, the system automatically falls back to mock data for development and testing purposes.

To configure Firebase in production:
1. Add your Firebase service account key
2. Update the Firebase configuration in `/config/firebase.js`
3. Set the `FIREBASE_DATABASE_URL` environment variable

## Technology Stack

- **Node.js & Express.js**: Backend server
- **Socket.io**: Real-time communication
- **mediasoup**: SFU for video conferencing
- **Firebase Admin SDK**: Data storage and management
- **CORS**: Cross-origin resource sharing