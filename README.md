# TripBuddy - AI-powered Lost & Found Platform

TripBuddy is a platform that helps travelers reconnect with their lost items through advanced AI image recognition and matching.

## Features

- User authentication and account management
- Lost and found item management
- AI-powered image analysis and object detection
- Intelligent matching of lost items with found items
- Real-time notifications for potential matches

## AI Image Comparison

TripBuddy uses state-of-the-art AI technologies to analyze and compare images:

1. **Google Cloud Vision API** for image analysis and object detection
2. **OpenCV.js** for advanced feature comparison between images
3. **Custom scoring algorithms** to determine match probabilities

The system works by:
- Extracting objects, labels, and visual characteristics from uploaded images
- Comparing these features between lost and found items
- Using a weighted scoring algorithm to determine potential matches
- Notifying users when high-confidence matches are found

## Getting Started

### Prerequisites

- Node.js (v18+)
- MongoDB
- Google Cloud Vision API key

### Installation

1. Clone the repository
```bash
git clone https://github.com/yourusername/tripbuddy.git
cd tripbuddy
```

2. Install dependencies
```bash
npm install
```

3. Set up environment variables (create a .env file)
```
PORT=3000
DB_CONNECTION=mongodb://localhost:27017/tripbuddy
TOKEN_SECRET=your_jwt_secret
TOKEN_EXPIRATION=1h
REFRESH_TOKEN_EXPIRATION=7d
GOOGLE_CLOUD_VISION_API_KEY=your_api_key
DOMAIN_BASE=http://localhost:3000
```

4. Start the development server
```bash
npm run dev
```

## API Documentation

The API documentation is available at `/api-docs` endpoint when the server is running.

Key endpoints for the image comparison feature:

- `POST /api/image-comparison/analyze` - Analyze an image using Google Cloud Vision API
- `POST /api/image-comparison/compare` - Compare two images for similarity
- `GET /api/image-comparison/find-matches/:id` - Find potential matches for a specific item

For frontend developers, see the [Frontend Integration Guide](./README-FRONTEND.md).

## Testing

```bash
# Run all tests
npm test

# Run specific test suites
npm run testAuth
npm run testItem
npm run testImageComparison
```

## Project Structure

```
src/
├── controllers/     # Request handlers
├── models/          # Database models
├── routes/          # API routes
├── services/        # Business logic and external services
├── tests/           # Test files
└── server.ts        # Server configuration
```

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/my-feature`)
3. Commit your changes (`git commit -m 'Add my feature'`)
4. Push to the branch (`git push origin feature/my-feature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License - see the LICENSE file for details. 