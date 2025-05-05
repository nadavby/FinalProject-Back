/* eslint-disable @typescript-eslint/no-explicit-any */
type LocationCoordinates = {
  lat: number;
  lng: number;
};

export const calculateDistance = (location1: any, location2: any): number => {
  try {
    const coords1 = extractCoordinates(location1);
    const coords2 = extractCoordinates(location2);

    if (!coords1 || !coords2) {
      return Infinity;
    }

    return haversineDistance(coords1, coords2);
  } catch (error) {
    console.error('Error calculating distance between locations:', error);
    return Infinity;
  }
};

const extractCoordinates = (location: any): LocationCoordinates | null => {
  if (!location) return null;

  if (typeof location === 'string') {
    try {
      const parsed = JSON.parse(location);
      if (parsed.lat !== undefined && parsed.lng !== undefined) {
        return { lat: parsed.lat, lng: parsed.lng };
      }
      return null;
    } catch {
      return null;
    }
  }

  if (location.lat !== undefined && location.lng !== undefined) {
    return { lat: location.lat, lng: location.lng };
  }

  if (location.coordinates && Array.isArray(location.coordinates) && location.coordinates.length >= 2) {
    return { lng: location.coordinates[0], lat: location.coordinates[1] };
  }

  return null;
};

const haversineDistance = (coords1: LocationCoordinates, coords2: LocationCoordinates): number => {
  const R = 6371; // Earth's radius in kilometers
  const dLat = degreesToRadians(coords2.lat - coords1.lat);
  const dLon = degreesToRadians(coords2.lng - coords1.lng);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(degreesToRadians(coords1.lat)) * Math.cos(degreesToRadians(coords2.lat)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
};

const degreesToRadians = (degrees: number): number => {
  return degrees * (Math.PI / 180);
}; 