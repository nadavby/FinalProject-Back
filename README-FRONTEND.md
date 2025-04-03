# TripBuddy Frontend Integration Guide

This guide provides instructions for integrating the TripBuddy backend AI image comparison features into your React+TypeScript frontend.

## API Endpoints

### 1. Image Comparison API Endpoints

The backend provides the following endpoints for image comparison:

#### Compare Two Images

```
POST /api/image-comparison/compare
```

Request body:
```json
{
  "image1Url": "https://example.com/image1.jpg",
  "image2Url": "https://example.com/image2.jpg"
}
```

Response:
```json
{
  "isMatch": true,
  "score": 85.5,
  "matchedObjects": [
    {
      "objectName": "Backpack",
      "similarityScore": 92.3
    },
    {
      "objectName": "Laptop",
      "similarityScore": 78.7
    }
  ]
}
```

#### Analyze an Image

```
POST /api/image-comparison/analyze
```

Request body:
```json
{
  "imageUrl": "https://example.com/image.jpg"
}
```

Response:
```json
{
  "labels": ["Backpack", "Travel", "Luggage"],
  "objects": [
    {
      "name": "Backpack",
      "score": 0.95,
      "boundingBox": {
        "x": 0.1,
        "y": 0.2,
        "width": 0.3,
        "height": 0.4
      }
    }
  ]
}
```

#### Find Matches for an Item

```
GET /api/image-comparison/find-matches/:itemId
```

Response:
```json
{
  "item": {
    "_id": "60d21b4667d0d8992e610c85",
    "userId": "60d0fe4f5311236168a109ca",
    "imageUrl": "https://example.com/items/1624365062087.jpg",
    "itemType": "lost",
    "description": "Red wallet with ID cards",
    "location": "Central Park",
    "category": "Wallet",
    "isResolved": false,
    "createdAt": "2023-01-01T19:00:00.000Z"
  },
  "matches": [
    {
      "item": {
        "_id": "60d21b4667d0d8992e610c86",
        "userId": "60d0fe4f5311236168a109cb",
        "imageUrl": "https://example.com/items/1624365062088.jpg",
        "itemType": "found",
        "description": "Found wallet in Central Park",
        "location": "Central Park",
        "category": "Wallet",
        "isResolved": false,
        "createdAt": "2023-01-02T19:00:00.000Z"
      },
      "score": 85.5
    }
  ]
}
```

## Frontend Implementation

### 1. API Client Setup

Create a service file for the image comparison functionality:

```typescript
// src/services/imageComparisonService.ts
import axios from 'axios';
import { apiClient } from './api-client';

export interface ComparisonResult {
  isMatch: boolean;
  score: number;
  matchedObjects: Array<{
    objectName: string;
    similarityScore: number;
  }>;
}

export interface AnalysisResult {
  labels: string[];
  objects: Array<{
    name: string;
    score: number;
    boundingBox: {
      x: number;
      y: number;
      width: number;
      height: number;
    };
  }>;
}

export interface MatchResult {
  item: any;
  matches: Array<{
    item: any;
    score: number;
  }>;
}

const imageComparisonService = {
  compareImages: async (image1Url: string, image2Url: string): Promise<ComparisonResult> => {
    const response = await apiClient.post('/api/image-comparison/compare', {
      image1Url,
      image2Url
    });
    return response.data;
  },

  analyzeImage: async (imageUrl: string): Promise<AnalysisResult> => {
    const response = await apiClient.post('/api/image-comparison/analyze', {
      imageUrl
    });
    return response.data;
  },

  findMatches: async (itemId: string): Promise<MatchResult> => {
    const response = await apiClient.get(`/api/image-comparison/find-matches/${itemId}`);
    return response.data;
  }
};

export default imageComparisonService;
```

### 2. React Component Integration

#### a. Compare Images Component

```tsx
// src/components/ImageComparison/CompareImages.tsx
import React, { useState } from 'react';
import imageComparisonService, { ComparisonResult } from '../../services/imageComparisonService';

const CompareImages: React.FC = () => {
  const [image1Url, setImage1Url] = useState('');
  const [image2Url, setImage2Url] = useState('');
  const [result, setResult] = useState<ComparisonResult | null>(null);
  const [loading, setLoading] = useState(false);

  const handleCompare = async () => {
    if (!image1Url || !image2Url) {
      alert('Please enter both image URLs');
      return;
    }

    setLoading(true);
    try {
      const comparisonResult = await imageComparisonService.compareImages(image1Url, image2Url);
      setResult(comparisonResult);
    } catch (error) {
      console.error('Error comparing images:', error);
      alert('Error comparing images');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="compare-images">
      <h2>Compare Images</h2>
      <div className="input-group">
        <label>Image 1 URL:</label>
        <input
          type="text"
          value={image1Url}
          onChange={(e) => setImage1Url(e.target.value)}
          placeholder="https://example.com/image1.jpg"
        />
      </div>
      <div className="input-group">
        <label>Image 2 URL:</label>
        <input
          type="text"
          value={image2Url}
          onChange={(e) => setImage2Url(e.target.value)}
          placeholder="https://example.com/image2.jpg"
        />
      </div>
      <button onClick={handleCompare} disabled={loading}>
        {loading ? 'Comparing...' : 'Compare Images'}
      </button>

      {result && (
        <div className="result">
          <h3>Comparison Result</h3>
          <p className={result.isMatch ? 'match' : 'no-match'}>
            {result.isMatch ? 'MATCH FOUND!' : 'No match found'}
          </p>
          <p>Similarity Score: {result.score.toFixed(2)}%</p>
          
          {result.matchedObjects.length > 0 && (
            <div className="matched-objects">
              <h4>Matched Objects:</h4>
              <ul>
                {result.matchedObjects.map((obj, index) => (
                  <li key={index}>
                    {obj.objectName}: {obj.similarityScore.toFixed(2)}%
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default CompareImages;
```

#### b. Display Potential Matches

To integrate the potential matches in your item detail view:

```tsx
// src/components/ItemDetail/ItemMatches.tsx
import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import imageComparisonService, { MatchResult } from '../../services/imageComparisonService';

const ItemMatches: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const [matches, setMatches] = useState<MatchResult | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchMatches = async () => {
      if (!id) return;
      
      try {
        const result = await imageComparisonService.findMatches(id);
        setMatches(result);
      } catch (error) {
        console.error('Error fetching matches:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchMatches();
  }, [id]);

  if (loading) {
    return <div>Loading potential matches...</div>;
  }

  if (!matches || matches.matches.length === 0) {
    return <div>No potential matches found for this item.</div>;
  }

  return (
    <div className="item-matches">
      <h2>Potential Matches</h2>
      <div className="matches-list">
        {matches.matches.map((match) => (
          <div key={match.item._id} className="match-card">
            <div className="match-image">
              <img src={match.item.imageUrl} alt={match.item.description || 'Item'} />
            </div>
            <div className="match-details">
              <h3>{match.item.description || 'Unnamed Item'}</h3>
              <p>Category: {match.item.category || 'N/A'}</p>
              <p>Location: {match.item.location || 'N/A'}</p>
              <p className="match-score">Match Score: {match.score.toFixed(2)}%</p>
              <Link to={`/items/${match.item._id}`} className="view-button">
                View Item
              </Link>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default ItemMatches;
```

### 3. CSS Styling (example)

```css
/* src/components/ImageComparison/styles.css */
.compare-images {
  max-width: 800px;
  margin: 0 auto;
  padding: 20px;
}

.input-group {
  margin-bottom: 15px;
}

.input-group label {
  display: block;
  margin-bottom: 5px;
  font-weight: bold;
}

.input-group input {
  width: 100%;
  padding: 8px;
  border: 1px solid #ccc;
  border-radius: 4px;
}

button {
  background-color: #4285f4;
  color: white;
  padding: 10px 15px;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-weight: bold;
}

button:disabled {
  background-color: #ccc;
  cursor: not-allowed;
}

.result {
  margin-top: 20px;
  padding: 15px;
  border: 1px solid #ccc;
  border-radius: 4px;
}

.match {
  color: green;
  font-weight: bold;
}

.no-match {
  color: red;
}

.matched-objects {
  margin-top: 15px;
}

.matched-objects ul {
  list-style-type: none;
  padding: 0;
}

.matched-objects li {
  padding: 5px 0;
}

/* Item matches styling */
.item-matches {
  margin-top: 30px;
}

.matches-list {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 20px;
}

.match-card {
  border: 1px solid #ddd;
  border-radius: 8px;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.match-image {
  height: 200px;
  overflow: hidden;
}

.match-image img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.match-details {
  padding: 15px;
}

.match-score {
  font-weight: bold;
  color: #4285f4;
}

.view-button {
  display: inline-block;
  background-color: #4285f4;
  color: white;
  padding: 8px 15px;
  text-decoration: none;
  border-radius: 4px;
  margin-top: 10px;
}

@media (max-width: 768px) {
  .matches-list {
    grid-template-columns: 1fr;
  }
}
```

## Integration Tips

1. **Authentication**: All API endpoints require authentication. Make sure your `apiClient` instance includes the authorization token in the request headers.

2. **Error Handling**: Implement proper error handling for API calls to provide a good user experience.

3. **Loading States**: Always show loading indicators while fetching data from the API.

4. **Caching**: Consider implementing client-side caching for image analysis results to improve performance.

5. **Image Upload**: When creating a new item, you can use the analyze endpoint to get AI insights about the image before submitting the item data.

## Example: Enhancing Item Upload Form

You can enhance your item upload form to include real-time analysis:

```tsx
// Excerpt from an item upload component
const [imageUrl, setImageUrl] = useState('');
const [analysis, setAnalysis] = useState(null);

// After the user provides an image URL or uploads an image
const handleImageUrlChange = async (url) => {
  setImageUrl(url);
  
  try {
    const analysisResult = await imageComparisonService.analyzeImage(url);
    setAnalysis(analysisResult);
    
    // Optionally pre-fill form fields based on the analysis
    if (analysisResult.labels.length > 0) {
      // Suggest a category based on the first label
      setCategory(analysisResult.labels[0]); 
    }
  } catch (error) {
    console.error('Error analyzing image:', error);
  }
};
```

This will help users by providing AI-powered suggestions during the item upload process. 