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
 * based on mandatory sub-area / zone assignments.
 *
 * Rules:
 *  1. Helper MUST be assigned to at least one zone (or serveAllAreas === true).
 *     If a helper has NO assigned zone → they get NO requests ("otherwise no request will gt").
 *  2. Helper only receives orders whose pickup or delivery location falls within
 *     one of their assigned zones.
 *  3. helper.serveAllAreas === true grants global eligibility.
 */
export function isHelperEligibleForOrder(
  helper: UserProfile,
  order: Order,
  areas?: AllowedAreaPolygon[],
  areasEnabled?: boolean
): boolean {
  // If geofencing / sub-areas are not configured or empty, no zones exist yet
  if (!areas || areas.length === 0) {
    return true;
  }

  // ── Explicit global flag: always eligible ───────────────────────────────────
  if (helper.serveAllAreas === true) {
    return true;
  }

  // ── Requirement: Helper must be assigned to a zone ──────────────────────────
  const hasPersonalAssignment = Boolean(helper.assignedAreaIds && helper.assignedAreaIds.length > 0);
  const isAssignedInAreaFleet = areas.some((a) => a.assignedHelperIds?.includes(helper.uid));
  const hasAnyAssignment = hasPersonalAssignment || isAssignedInAreaFleet;

  // Unassigned helpers receive NO orders
  if (!hasAnyAssignment) {
    return false;
  }

  const matchingAreas = getAreasForOrder(order, areas);

  // If order was explicitly tagged with an areaId
  if (order.areaId) {
    if (helper.assignedAreaIds?.includes(order.areaId)) return true;
    const targetArea = areas.find((a) => a.id === order.areaId);
    if (targetArea?.assignedHelperIds?.includes(helper.uid)) return true;
  }
  if (order.areaIds && order.areaIds.length > 0) {
    const hasOverlap = order.areaIds.some(
      (aid) =>
        helper.assignedAreaIds?.includes(aid) ||
        areas.find((a) => a.id === aid)?.assignedHelperIds?.includes(helper.uid)
    );
    if (hasOverlap) return true;
  }

  // If order coordinates do not fall into any defined area polygon:
  if (matchingAreas.length === 0) {
    return false;
  }

  // Helper is eligible if the order falls into at least one of their assigned zones
  return matchingAreas.some((area) => {
    if (area.assignedHelperIds && area.assignedHelperIds.includes(helper.uid)) {
      return true;
    }
    if (helper.assignedAreaIds && helper.assignedAreaIds.includes(area.id)) {
      return true;
    }
    return false;
  });
}

/**
 * Checks whether an order belongs to a specific zone.
 */
export function isOrderInZone(
  order: Order,
  zoneId: string,
  areas?: AllowedAreaPolygon[]
): boolean {
  if (order.areaId === zoneId) return true;
  if (order.areaIds && order.areaIds.includes(zoneId)) return true;
  if (!areas || areas.length === 0) return false;
  const matched = getAreasForOrder(order, areas);
  return matched.some((a) => a.id === zoneId);
}

/**
 * Checks whether an order belongs to any of the specified zones.
 */
export function isOrderInAnyZone(
  order: Order,
  zoneIds: string[],
  areas?: AllowedAreaPolygon[]
): boolean {
  if (!zoneIds || zoneIds.length === 0) return false;
  return zoneIds.some((zid) => isOrderInZone(order, zid, areas));
}

/**
 * Checks whether a helper is assigned to a specific zone.
 */
export function isHelperInZone(
  helper: UserProfile,
  zoneId: string,
  areas?: AllowedAreaPolygon[]
): boolean {
  if (helper.serveAllAreas) return true;
  if (helper.assignedAreaIds && helper.assignedAreaIds.includes(zoneId)) return true;
  if (areas) {
    const area = areas.find((a) => a.id === zoneId);
    if (area?.assignedHelperIds?.includes(helper.uid)) return true;
  }
  return false;
}

/**
 * Checks whether a helper is assigned to any of the specified zones.
 */
export function isHelperInAnyZone(
  helper: UserProfile,
  zoneIds: string[],
  areas?: AllowedAreaPolygon[]
): boolean {
  if (!zoneIds || zoneIds.length === 0) return false;
  if (helper.serveAllAreas) return true;
  return zoneIds.some((zid) => isHelperInZone(helper, zid, areas));
}

/**
 * Checks whether an admin is assigned to manage a specific zone.
 * Super Admins and admins without specific zone restrictions have access to all zones.
 */
export function isAdminInZone(
  admin: UserProfile,
  zoneId: string,
  areas?: AllowedAreaPolygon[]
): boolean {
  if (admin.isSuperAdmin) return true;
  const assigned = admin.assignedAreaIds || (admin.areaId ? [admin.areaId] : (admin as any).areaIds || []);
  if (!assigned || assigned.length === 0) {
    // Unassigned admin has NO access to any zone
    return false;
  }
  if (assigned.includes(zoneId)) return true;
  if (areas) {
    const area = areas.find((a) => a.id === zoneId);
    if (area?.assignedAdminIds?.includes(admin.uid)) return true;
  }
  return false;
}

/**
 * Checks whether an admin is assigned to any of the specified zones.
 */
export function isAdminInAnyZone(
  admin: UserProfile,
  zoneIds: string[],
  areas?: AllowedAreaPolygon[]
): boolean {
  if (admin.isSuperAdmin) return true;
  const assigned = admin.assignedAreaIds || (admin.areaId ? [admin.areaId] : (admin as any).areaIds || []);
  if (!assigned || assigned.length === 0) return false;
  return zoneIds.some((zid) => isAdminInZone(admin, zid, areas));
}

/**
 * Checks whether a user belongs to any of the specified zones.
 * - Super admin always matches
 * - Users with assignedAreaIds / areaId matching the zone
 * - Helpers or admins listed in the zone polygon assignedHelperIds / assignedAdminIds
 * - Helpers with serveAllAreas flag
 * - Customers who have placed or received orders within any of the zones
 */
export function isUserInZoneScope(
  user: UserProfile,
  zoneIds: string[],
  areas?: AllowedAreaPolygon[],
  userOrders?: Order[]
): boolean {
  if (!zoneIds || zoneIds.length === 0) return true;
  if (user.isSuperAdmin) return true;

  // Direct assignedAreaIds or areaId / areaIds
  if (user.assignedAreaIds && user.assignedAreaIds.some((id) => zoneIds.includes(id))) return true;
  if (user.areaId && zoneIds.includes(user.areaId)) return true;
  const userAreaIds = (user as any).areaIds;
  if (Array.isArray(userAreaIds) && userAreaIds.some((id: string) => zoneIds.includes(id))) return true;

  // Area polygon helper or admin assignment
  if (areas && areas.length > 0) {
    if (areas.some((a) => zoneIds.includes(a.id) && (a.assignedHelperIds?.includes(user.uid) || a.assignedAdminIds?.includes(user.uid)))) {
      return true;
    }
  }

  // Helpers that serve all areas
  if (user.isHelper && user.serveAllAreas) {
    return true;
  }

  // Orders placed by or assigned to this user
  if (userOrders && userOrders.length > 0) {
    const relevantOrders = userOrders.filter((o) => o.customerId === user.uid || o.helperId === user.uid);
    if (relevantOrders.length > 0) {
      return relevantOrders.some((o) => isOrderInAnyZone(o, zoneIds, areas));
    }
  }

  return false;
}


