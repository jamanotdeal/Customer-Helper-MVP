export function formatPlacedDateTime(dateStr: string): string {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;

  const day = d.getDate().toString().padStart(2, '0');
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const month = months[d.getMonth()];
  const year = d.getFullYear();

  let hours = d.getHours();
  const minutes = d.getMinutes().toString().padStart(2, '0');
  const ampm = hours >= 12 ? 'PM' : 'AM';
  hours = hours % 12;
  hours = hours ? hours : 12;
  const formattedHours = hours.toString().padStart(2, '0');

  return `${day} ${month} ${year}, ${formattedHours}:${minutes} ${ampm}`;
}

export function formatCreatedAt(dateStr: string): string {
  if (!dateStr) return '';
  return `Created: ${formatPlacedDateTime(dateStr)}`;
}

export function formatTimeOnly(dateStr: string): string {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;

  let hours = d.getHours();
  const minutes = d.getMinutes().toString().padStart(2, '0');
  const ampm = hours >= 12 ? 'pm' : 'am';
  hours = hours % 12;
  hours = hours ? hours : 12;
  const formattedHours = hours.toString().padStart(2, '0');

  return `${formattedHours}:${minutes}${ampm}`;
}

export function formatDurationMinutes(totalMins: number): string {
  if (isNaN(totalMins) || totalMins <= 0) return '0m';
  const mins = Math.round(totalMins);
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  const remMins = mins % 60;
  return remMins > 0 ? `${hrs}h ${remMins}m` : `${hrs}h`;
}

export interface OrderTimeInfo {
  createdAt: string;
  status?: string;
  deliveredAt?: string;
  cancelledAt?: string;
  updatedAt?: string;
  needDeliveryBack?: boolean;
  deliveryBackTime?: string;
  deliveryBackSetAt?: string;
  statusHistory?: { status: string; timestamp: string }[];
}

export function getOrderEffectiveElapsedMs(order: OrderTimeInfo, targetEndMs?: number): number {
  if (!order || !order.createdAt) return 0;
  const start = new Date(order.createdAt).getTime();
  if (isNaN(start)) return 0;

  let end = targetEndMs;
  if (end === undefined) {
    if (order.status === 'DELIVERED' && order.deliveredAt) {
      end = new Date(order.deliveredAt).getTime();
    } else if (order.status === 'CANCELED' || order.status === 'CANCELLED') {
      const cancelHist = order.statusHistory?.find((h) => h.status === 'CANCELED' || h.status === 'CANCELLED')?.timestamp;
      const cancelTimeStr = order.cancelledAt || cancelHist || order.updatedAt;
      end = cancelTimeStr ? new Date(cancelTimeStr).getTime() : Date.now();
    } else {
      end = Date.now();
    }
  }

  if (isNaN(end)) end = Date.now();
  let diffMs = Math.max(0, end - start);

  // Subtract paused window for Two-Way scheduled return
  if (order.needDeliveryBack && order.deliveryBackTime) {
    const pauseStartStr = order.deliveryBackSetAt || order.updatedAt;
    const pauseStartMs = pauseStartStr ? new Date(pauseStartStr).getTime() : NaN;
    const pauseEndMs = new Date(order.deliveryBackTime).getTime();

    if (!isNaN(pauseStartMs) && !isNaN(pauseEndMs) && pauseEndMs > pauseStartMs) {
      const overlapStart = Math.max(start, pauseStartMs);
      const overlapEnd = Math.min(end, pauseEndMs);
      if (overlapEnd > overlapStart) {
        diffMs -= (overlapEnd - overlapStart);
      }
    }
  }

  return Math.max(0, diffMs);
}

export function formatMinSecText(createdAtStr: string, endedAtStr?: string): string {
  if (!createdAtStr) return '00:00min';
  const start = new Date(createdAtStr).getTime();
  if (isNaN(start)) return '00:00min';
  const end = endedAtStr ? new Date(endedAtStr).getTime() : Date.now();
  if (isNaN(end)) return '00:00min';

  const diffMs = Math.max(0, end - start);
  const totalSeconds = Math.floor(diffMs / 1000);

  const hours = Math.floor(totalSeconds / 3600);
  const mins = Math.floor((totalSeconds % 3600) / 60);
  const secs = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}h ${mins.toString().padStart(2, '0')}m ${secs.toString().padStart(2, '0')}s`;
  }
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}min`;
}

export function getElapsedTime(createdAtStrOrOrder: string | OrderTimeInfo, endAtStr?: string): string {
  if (typeof createdAtStrOrOrder === 'object') {
    const diffMs = getOrderEffectiveElapsedMs(createdAtStrOrOrder);
    const totalSeconds = Math.floor(diffMs / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const mins = Math.floor((totalSeconds % 3600) / 60);
    const secs = totalSeconds % 60;
    if (hours > 0) {
      return `${hours}h ${mins.toString().padStart(2, '0')}m ${secs.toString().padStart(2, '0')}s`;
    }
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}min`;
  }
  return formatMinSecText(createdAtStrOrOrder, endAtStr);
}

export function getDeliveryDurationText(createdAtStrOrOrder: string | OrderTimeInfo, endedAtStr?: string): string {
  if (typeof createdAtStrOrOrder === 'object') {
    const diffMs = getOrderEffectiveElapsedMs(createdAtStrOrOrder);
    const totalMins = Math.round(diffMs / 60000);
    if (totalMins >= 60) {
      return formatDurationMinutes(totalMins);
    }
    if (totalMins > 0) {
      return `${totalMins}mins`;
    }
    return getElapsedTime(createdAtStrOrOrder);
  }

  if (!createdAtStrOrOrder) return '';
  const start = new Date(createdAtStrOrOrder).getTime();
  const end = endedAtStr ? new Date(endedAtStr).getTime() : Date.now();
  if (isNaN(start) || isNaN(end)) return '';

  const diffMs = Math.max(0, end - start);
  const totalMins = Math.round(diffMs / 60000);
  if (totalMins >= 60) {
    return formatDurationMinutes(totalMins);
  }
  if (totalMins > 0) {
    return `${totalMins}mins`;
  }
  return formatMinSecText(createdAtStrOrOrder, endedAtStr);
}

export function getElapsedMinutes(createdAtStrOrOrder: string | OrderTimeInfo, endedAtStr?: string): number {
  if (typeof createdAtStrOrOrder === 'object') {
    return getOrderEffectiveElapsedMs(createdAtStrOrOrder) / (1000 * 60);
  }
  if (!createdAtStrOrOrder) return 0;
  const start = new Date(createdAtStrOrOrder).getTime();
  if (isNaN(start)) return 0;
  const end = endedAtStr ? new Date(endedAtStr).getTime() : Date.now();
  if (isNaN(end)) return 0;
  return Math.max(0, (end - start) / (1000 * 60));
}

/**
 * Returns formatted acceptance duration text for an order (time taken from createdAt until acceptedAt/ACCEPTED status).
 * Returns null if order has not been accepted yet.
 */
export function getOrderAcceptanceDurationText(order: {
  createdAt: string;
  acceptedAt?: string;
  statusHistory?: { status: string; timestamp: string }[];
}): string | null {
  const acceptedTime =
    order.acceptedAt ||
    order.statusHistory?.find((h) => h.status === 'ACCEPTED')?.timestamp;

  if (!acceptedTime) return null;
  return formatMinSecText(order.createdAt, acceptedTime);
}

/**
 * Psychological color urgency styling for helper view based on order duration:
 * - < 40 min: normal
 * - 40 to 54 min: soft yellow background
 * - >= 55 min: soft red background
 */
export function getHelperUrgencyBgClass(createdAtStr: string, isDone?: boolean): {
  bgClass: string;
  borderClass: string;
  badgeClass: string;
  timerClass: string;
  urgencyLevel: 'normal' | 'yellow' | 'red';
} {
  if (isDone) {
    return {
      bgClass: 'bg-white',
      borderClass: 'border-gray-200',
      badgeClass: 'bg-gray-100 text-gray-700 border-gray-200',
      timerClass: 'bg-gray-100 text-gray-700 border-gray-200',
      urgencyLevel: 'normal',
    };
  }
  const mins = getElapsedMinutes(createdAtStr);
  if (mins >= 55) {
    return {
      bgClass: 'bg-red-50/95 border-red-300 shadow-md shadow-red-100/60 ring-2 ring-red-200',
      borderClass: 'border-red-400',
      badgeClass: 'bg-red-200 text-red-900 border-red-300 font-black',
      timerClass: 'bg-red-200 text-red-900 border-red-300 font-black animate-pulse',
      urgencyLevel: 'red',
    };
  }
  if (mins >= 40) {
    return {
      bgClass: 'bg-amber-50/95 border-amber-300 shadow-sm shadow-amber-100/60 ring-2 ring-amber-200',
      borderClass: 'border-amber-400',
      badgeClass: 'bg-amber-200 text-amber-900 border-amber-300 font-black',
      timerClass: 'bg-amber-200 text-amber-900 border-amber-300 font-black',
      urgencyLevel: 'yellow',
    };
  }
  return {
    bgClass: 'bg-white',
    borderClass: 'border-gray-100',
    badgeClass: 'bg-red-50 text-red-800 border-red-100 font-black',
    timerClass: 'bg-red-50 text-red-800 border-red-100 font-black',
    urgencyLevel: 'normal',
  };
}

