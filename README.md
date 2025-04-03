# TripBuddy Lost & Found - Backend

This is the backend for the TripBuddy Lost & Found application, which helps users find their lost items or report found items.

## Features

- User authentication (login, registration, profile)
- Upload images of lost or found items
- AI-powered image recognition and matching using Google Cloud Vision API
- Notification system for potential matches
- Item tracking and management

## Tech Stack

- **Node.js** - JavaScript runtime
- **Express** - Web framework
- **MongoDB** - Database
- **TypeScript** - Programming language
- **Google Cloud Vision API** - Image analysis and recognition
- **JWT** - Authentication

## API Endpoints

### Authentication
- `POST /auth/register` - Register a new user
- `POST /auth/login` - Login
- `POST /auth/logout` - Logout
- `POST /auth/refresh` - Refresh access token

### Lost & Found Items
- `POST /items/upload-item` - Upload a lost or found item
- `GET /items` - Get all items (with filtering options)
- `GET /items/:id` - Get item by ID
- `PUT /items/:id/resolve` - Mark an item as resolved
- `PUT /items/:id` - Update an item
- `DELETE /items/:id` - Delete an item

### Files
- `POST /file` - Upload files

## Getting Started

### Prerequisites

- Node.js
- MongoDB
- Google Cloud Vision API key

### Installation

1. Clone the repository
```
git clone https://github.com/nadavby/FinalProject-Back.git
cd FinalProject-Back
```

2. Install dependencies
```
npm install
```

3. Configure environment variables
Create a `.env` file in the root directory with:
```
PORT=3000
DB_CONNECTION=mongodb://localhost:27017/tripbuddy
TOKEN_SECRET=your_jwt_secret
TOKEN_EXPIRATION=1h
REFRESH_TOKEN_EXPIRATION=7d
DOMAIN_BASE=http://localhost:3000
GOOGLE_CLOUD_VISION_API_KEY=your_google_cloud_vision_api_key
```

4. Start the server
```
npm run dev
```

5. Access the API documentation at `http://localhost:3000/api-docs`

## How It Works

1. Users upload images of lost or found items
2. The system analyzes the images using Google Cloud Vision API
3. When a lost item is uploaded, it's compared to all found items
4. When a found item is uploaded, it's compared to all lost items
5. If a potential match is found, the original uploader is notified
6. Users can mark items as resolved when they're found or claimed

## License

This project is licensed under the ISC License.

## Authors

- Nadav Ben Yehonatan
- Chamak Sacha 