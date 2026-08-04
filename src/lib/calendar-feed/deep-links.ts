export function buildGoogleSubscribeUrl(feedUrl: string): string {
  return `https://calendar.google.com/calendar/u/0/r?cid=${encodeURIComponent(feedUrl)}`;
}

export function buildAppleWebcalUrl(feedUrl: string): string {
  if (feedUrl.startsWith('https://')) return 'webcal://' + feedUrl.slice('https://'.length);
  if (feedUrl.startsWith('http://')) return 'webcal://' + feedUrl.slice('http://'.length);
  throw new Error(`buildAppleWebcalUrl: unsupported scheme in ${feedUrl}`);
}

export function buildOutlookSubscribeUrl(feedUrl: string, name: string): string {
  const u = encodeURIComponent(feedUrl);
  const n = encodeURIComponent(name);
  return `https://outlook.live.com/calendar/0/addfromweb?url=${u}&name=${n}`;
}
