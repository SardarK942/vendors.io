export type MediaItem = { type: 'image'; url: string } | { type: 'video'; uid: string };

/** One ordered media list for the whole gallery: photos first, clips after.
 *  Every display surface indexes into this, so the grid→lightbox handoff stays
 *  consistent. */
export function mergePortfolioMedia(images: string[], videoUids: string[]): MediaItem[] {
  return [
    ...images.map((url): MediaItem => ({ type: 'image', url })),
    ...videoUids.map((uid): MediaItem => ({ type: 'video', uid })),
  ];
}
