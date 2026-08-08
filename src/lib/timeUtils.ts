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
