/**
 * Utility module for fetching real road route geometries from OSRM routing API.
 * Converts coordinates to Leaflet-compatible [lat, lng] arrays.
 */

export interface LatLngPoint {
  lat: number;
  lng: number;
}

// In-memory cache for fetched routes
const routeCache = new Map<string, [number, number][]>();

/**
 * Fetches accurate road route polylines between multiple waypoints using OSRM driving router.
 * @param waypoints List of points [{ lat, lng }] along the route
 * @returns Array of [lat, lng] coordinate pairs following actual roads
 */
export async function fetchRoadRoute(waypoints: LatLngPoint[]): Promise<[number, number][]> {
  // Guard: require at least 2 points to form a route
  if (!waypoints || waypoints.length < 2) {
    return waypoints ? waypoints.map((p) => [p.lat, p.lng]) : [];
  }

  // Filter invalid coordinates
  const validWaypoints = waypoints.filter(
    (p) => typeof p.lat === 'number' && !isNaN(p.lat) && typeof p.lng === 'number' && !isNaN(p.lng)
  );

  if (validWaypoints.length < 2) {
    return validWaypoints.map((p) => [p.lat, p.lng]);
  }

  // Cache key based on coordinates rounded to 5 decimal places (~1m accuracy)
  const cacheKey = validWaypoints
    .map((p) => `${p.lat.toFixed(5)},${p.lng.toFixed(5)}`)
    .join(';');

  if (routeCache.has(cacheKey)) {
    return routeCache.get(cacheKey)!;
  }

  try {
    // OSRM expects coordinates in "lng,lat" format separated by semicolon
    const coordString = validWaypoints.map((p) => `${p.lng},${p.lat}`).join(';');
    const url = `https://router.project-osrm.org/route/v1/driving/${coordString}?overview=full&geometries=geojson`;

    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`OSRM API error: status ${response.status}`);
    }

    const text = await response.text();
    if (text && !text.trim().startsWith('<')) {
      const data = JSON.parse(text);

      if (data.code === 'Ok' && data.routes && data.routes.length > 0) {
        const coordinates: [number, number][] = data.routes[0].geometry.coordinates.map(
          (coord: [number, number]) => [coord[1], coord[0]] // OSRM gives [lng, lat], convert to Leaflet [lat, lng]
        );

        if (coordinates.length > 0) {
          routeCache.set(cacheKey, coordinates);
          return coordinates;
        }
      }
    }
  } catch (error) {
    console.warn('Road routing API call failed, falling back to direct line:', error);
  }

  // Fallback to direct straight line if API fails or returns no routes
  const fallbackRoute: [number, number][] = validWaypoints.map((p) => [p.lat, p.lng]);
  routeCache.set(cacheKey, fallbackRoute);
  return fallbackRoute;
}
