import { AllowedAreaPolygon } from '@/types';

/**
 * Checks if a point (lat, lng) is inside a polygon using Ray-Casting algorithm.
 */
export function isPointInPolygon(
  point: { lat: number; lng: number },
  polygon: { lat: number; lng: number }[]
): boolean {
  if (!polygon || polygon.length < 3) return false;

  const x = point.lng;
  const y = point.lat;

  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].lng;
    const yi = polygon[i].lat;
    const xj = polygon[j].lng;
    const yj = polygon[j].lat;

    const intersect =
      yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }

  return inside;
}

/**
 * Checks if a location is allowed based on active area polygons in settings.
 * If allowedDeliveryAreasEnabled is false or areas array is empty, all locations are allowed.
 */
export function isLocationInAllowedAreas(
  point: { lat: number; lng: number } | undefined,
  enabled?: boolean,
  areas?: AllowedAreaPolygon[]
): boolean {
  if (!enabled || !areas || areas.length === 0) {
    return true; // No restriction active
  }
  if (!point || typeof point.lat !== 'number' || typeof point.lng !== 'number') {
    return true; // If coordinates not resolved yet, allow bypass until pin placed
  }

  // Point must fall inside AT LEAST ONE defined serving area polygon
  return areas.some((area) => isPointInPolygon(point, area.coordinates));
}
