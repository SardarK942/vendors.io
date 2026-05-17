export function countdown(eventDate: string): string {
  const days = Math.ceil(
    (new Date(eventDate + 'T12:00:00Z').getTime() - Date.now()) / 86_400_000
  );
  if (days < 0) return 'Past';
  if (days === 0) return 'today';
  if (days === 1) return 'tomorrow';
  if (days < 7) return `${days}d`;
  if (days < 30) return `${Math.floor(days / 7)}w`;
  if (days < 365) return `${Math.floor(days / 30)}mo`;
  return `${Math.floor(days / 365)}y`;
}
