export interface SpiderfiedItem<T> {
  item: T;
  originalLat: number;
  originalLng: number;
  displayLat: number;
  displayLng: number;
  overlapCount: number;
  overlapIndex: number;
}

/**
 * Declutters/spiderfies nearby or overlapping map coordinates.
 * Groups items within thresholdDegrees (~0.00035 deg ≈ 35 meters) and distributes
 * clustered items evenly in a circular/spiral offset pattern so every marker remains visible.
 */
export function getSpiderfiedCoordinates<T>(
  items: T[],
  getLat: (item: T) => number | undefined | null,
  getLng: (item: T) => number | undefined | null,
  thresholdDegrees = 0.00035,
  spreadRadiusDegrees = 0.00028
): SpiderfiedItem<T>[] {
  const validItems: { item: T; lat: number; lng: number; index: number }[] = [];

  items.forEach((item, index) => {
    const lat = getLat(item);
    const lng = getLng(item);
    if (
      lat !== undefined &&
      lat !== null &&
      !isNaN(lat) &&
      lng !== undefined &&
      lng !== null &&
      !isNaN(lng)
    ) {
      validItems.push({ item, lat, lng, index });
    }
  });

  if (validItems.length === 0) return [];

  const visited = new Array(validItems.length).fill(false);
  const result: SpiderfiedItem<T>[] = new Array(validItems.length);

  for (let i = 0; i < validItems.length; i++) {
    if (visited[i]) continue;

    const cluster: typeof validItems = [validItems[i]];
    visited[i] = true;

    for (let j = i + 1; j < validItems.length; j++) {
      if (visited[j]) continue;
      const dLat = validItems[i].lat - validItems[j].lat;
      const dLng = validItems[i].lng - validItems[j].lng;
      const distance = Math.hypot(dLat, dLng);

      if (distance < thresholdDegrees) {
        cluster.push(validItems[j]);
        visited[j] = true;
      }
    }

    const count = cluster.length;
    if (count === 1) {
      const entry = cluster[0];
      result[entry.index] = {
        item: entry.item,
        originalLat: entry.lat,
        originalLng: entry.lng,
        displayLat: entry.lat,
        displayLng: entry.lng,
        overlapCount: 1,
        overlapIndex: 1,
      };
    } else {
      const centerLat = cluster.reduce((sum, c) => sum + c.lat, 0) / count;
      const centerLng = cluster.reduce((sum, c) => sum + c.lng, 0) / count;

      cluster.forEach((entry, idx) => {
        const angle = (2 * Math.PI * idx) / count;
        const currentRadius = spreadRadiusDegrees * (1 + Math.floor(idx / 6) * 0.5);
        const displayLat = centerLat + currentRadius * Math.sin(angle);
        const lngCos = Math.cos((centerLat * Math.PI) / 180) || 1;
        const displayLng = centerLng + (currentRadius * Math.cos(angle)) / lngCos;

        result[entry.index] = {
          item: entry.item,
          originalLat: entry.lat,
          originalLng: entry.lng,
          displayLat,
          displayLng,
          overlapCount: count,
          overlapIndex: idx + 1,
        };
      });
    }
  }

  return result.filter(Boolean);
}

/**
 * Attaches hover elevation listener to a Leaflet marker so it pops to the front on mouseover.
 */
export function setupMarkerHoverElevation(marker: any) {
  if (!marker || typeof marker.on !== 'function') return;
  try {
    marker.on('mouseover', () => {
      if (typeof marker.setZIndexOffset === 'function') {
        marker.setZIndexOffset(1000);
      }
    });
    marker.on('mouseout', () => {
      if (typeof marker.setZIndexOffset === 'function') {
        marker.setZIndexOffset(0);
      }
    });
  } catch (e) {
    // Ignore error if marker destroyed
  }
}

/**
 * Formats a raw reverse geocoded display address string into a clean, concise local address.
 * Removes redundant trailing administrative components like country, division, district, and postal code.
 */
export function formatShortAddress(displayName: string): string {
  if (!displayName) return '';

  const parts = displayName
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean);

  const filteredParts = parts.filter((part) => {
    const lower = part.toLowerCase();

    // Remove country
    if (lower === 'bangladesh' || lower === 'বাংলাদেশ') return false;

    // Remove 4 to 6 digit postal code
    if (/^\d{4,6}$/.test(part)) return false;

    // Remove division / state
    if (
      lower.includes('বিভাগ') ||
      lower.endsWith(' division') ||
      lower === 'division'
    ) return false;

    // Remove district (e.g. "ঢাকা জেলা", "Dhaka District")
    if (
      lower.includes('জেলা') ||
      lower.endsWith(' district') ||
      lower === 'district'
    ) return false;

    return true;
  });

  if (filteredParts.length === 0) return displayName;

  return filteredParts.join(', ');
}

