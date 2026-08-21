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

export function getElapsedTime(createdAtStr: string, endAtStr?: string): string {
  if (!createdAtStr) return '0s';
  const start = new Date(createdAtStr).getTime();
  if (isNaN(start)) return '0s';
  const end = endAtStr ? new Date(endAtStr).getTime() : Date.now();
  if (isNaN(end)) return '0s';

  const diffMs = Math.max(0, end - start);
  const totalSeconds = Math.floor(diffMs / 1000);

  const hours = Math.floor(totalSeconds / 3600);
  const mins = Math.floor((totalSeconds % 3600) / 60);
  const secs = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}h ${mins.toString().padStart(2, '0')}m ${secs.toString().padStart(2, '0')}s`;
  }
  return `${mins}m ${secs.toString().padStart(2, '0')}s`;
}

export function getDeliveryDurationText(createdAtStr: string, endedAtStr?: string): string {
  if (!createdAtStr || !endedAtStr) return '';
  const start = new Date(createdAtStr).getTime();
  const end = new Date(endedAtStr).getTime();
  if (isNaN(start) || isNaN(end)) return '';

  const diffMs = Math.max(0, end - start);
  const totalSeconds = Math.floor(diffMs / 1000);

  const hours = Math.floor(totalSeconds / 3600);
  const mins = Math.floor((totalSeconds % 3600) / 60);
  const secs = totalSeconds % 60;

  if (hours > 0) {
    return `${hours} hr ${mins} min ${secs} sec`;
  }
  if (mins > 0) {
    return `${mins} min ${secs} sec`;
  }
  return `${secs} sec`;
}

export function getElapsedMinutes(createdAtStr: string, endedAtStr?: string): number {
  if (!createdAtStr) return 0;
  const start = new Date(createdAtStr).getTime();
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
  return getDeliveryDurationText(order.createdAt, acceptedTime);
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

