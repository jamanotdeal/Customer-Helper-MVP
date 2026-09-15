import { AllowedAreaPolygon, Order, UserProfile } from '@/types';

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

/**
 * Returns all configured areas that contain the given point.
 */
export function getAreasForPoint(
  point: { lat?: number; lng?: number } | undefined,
  areas?: AllowedAreaPolygon[]
): AllowedAreaPolygon[] {
  if (!point || typeof point.lat !== 'number' || typeof point.lng !== 'number' || !areas) {
    return [];
  }
  const validPoint = { lat: point.lat, lng: point.lng };
  return areas.filter((area) => isPointInPolygon(validPoint, area.coordinates));
}

/**
 * Returns all areas matching an order's delivery location (or pickup location).
 */
export function getAreasForOrder(
  order: Order,
  areas?: AllowedAreaPolygon[]
): AllowedAreaPolygon[] {
  if (!areas || areas.length === 0) return [];

  const matched = new Map<string, AllowedAreaPolygon>();

  // Check delivery location
  if (order.deliveryLocation?.lat && order.deliveryLocation?.lng) {
    const deliveryAreas = getAreasForPoint(
      { lat: order.deliveryLocation.lat, lng: order.deliveryLocation.lng },
      areas
    );
    deliveryAreas.forEach((a) => matched.set(a.id, a));
  }

  // Check pickup location
  if (order.pickupLocation?.lat && order.pickupLocation?.lng) {
    const pickupAreas = getAreasForPoint(
      { lat: order.pickupLocation.lat, lng: order.pickupLocation.lng },
      areas
    );
    pickupAreas.forEach((a) => matched.set(a.id, a));
  }

  return Array.from(matched.values());
}

/**
 * Calculates the bounding center (centroid) of a polygon for map labels and markers.
 */
export function getPolygonCenter(coordinates: { lat: number; lng: number }[]): { lat: number; lng: number } {
  if (!coordinates || coordinates.length === 0) {
    return { lat: 23.8759, lng: 90.3795 };
  }

  let totalLat = 0;
  let totalLng = 0;
  coordinates.forEach((pt) => {
    totalLat += pt.lat;
    totalLng += pt.lng;
  });

  return {
    lat: totalLat / coordinates.length,
    lng: totalLng / coordinates.length,
  };
}

/**
 * Determines whether a helper is authorized to receive a notification & view an order
 * based on sub-area assignments.
 *
 * Rules:
 *  1. If a helper has NO assignedAreaIds (unassigned) → eligible for ALL areas.
 *  2. If a helper HAS assignedAreaIds → only eligible for orders whose location
 *     falls within one of their assigned areas (or an area that explicitly lists
 *     them in assignedHelperIds).
 *  3. helper.serveAllAreas === true always overrides and grants full eligibility.
 */
export function isHelperEligibleForOrder(
  helper: UserProfile,
  order: Order,
  areas?: AllowedAreaPolygon[],
  areasEnabled?: boolean
): boolean {
  // If geofencing / sub-areas are not configured or empty, all helpers are eligible
  if (!areas || areas.length === 0) {
    return true;
  }

  const matchingAreas = getAreasForOrder(order, areas);

  // If the order doesn't fall into any defined sub-area:
  // - If geofencing is strictly enforced, only serveAllAreas helpers (or unassigned helpers) see it
  // - If not strictly enforced, allow all helpers
  if (matchingAreas.length === 0) {
    if (areasEnabled) {
      // Unassigned helpers (no assignedAreaIds) are treated as global and can see it
      const hasAreaAssignment = helper.assignedAreaIds && helper.assignedAreaIds.length > 0;
      if (!hasAreaAssignment) return true;
      return helper.serveAllAreas !== false;
    }
    return true;
  }

  // ── Explicit global flag: always eligible ───────────────────────────────────
  if (helper.serveAllAreas === true) {
    return true;
  }

  // ── Rule 2: Unassigned helpers receive orders from ALL areas ─────────────────
  // A helper with no specific sub-area assignments is considered "global" and
  // should receive new-order notifications regardless of which area the order is in.
  const hasAreaAssignment = helper.assignedAreaIds && helper.assignedAreaIds.length > 0;
  if (!hasAreaAssignment) {
    return true;
  }

  // ── Rule 1: Assigned helpers only receive orders from their assigned areas ───
  // For each area the order falls into, check whether this helper is authorised:
  //   a) The area explicitly lists this helper's uid in assignedHelperIds, OR
  //   b) The helper's own assignedAreaIds includes this area's id.
  return matchingAreas.some((area) => {
    // Area has explicit assigned helper IDs — check direct membership
    if (area.assignedHelperIds && area.assignedHelperIds.length > 0) {
      if (area.assignedHelperIds.includes(helper.uid)) return true;
    }

    // Helper's personal assigned area list includes this area
    if (helper.assignedAreaIds && helper.assignedAreaIds.includes(area.id)) {
      return true;
    }

    // Area is open (allHelpersAssigned true, or no restrictions set):
    // Since this helper IS assigned elsewhere, only pass them through if
    // they are explicitly assigned to this open area too.
    if (
      area.allHelpersAssigned === true ||
      (area.allHelpersAssigned !== false && (!area.assignedHelperIds || area.assignedHelperIds.length === 0))
    ) {
      // An "open" area with no helper-level assignment for this helper
      // — since the helper has assignments elsewhere, they must be explicitly
      //   listed (already handled above) to receive open-area orders.
      return false;
    }

    return false;
  });
}
