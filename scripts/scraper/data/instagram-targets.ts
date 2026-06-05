// IG hashtag list refocused 2026-06-04 after the original sweep returned
// global content (Prague restaurants, DMV Chai Cart, etc.) due to broad
// hashtags. Now only desi-specific or Arab-specific Chicago-locked tags.

export const HASHTAGS_BY_CATEGORY: Record<string, string[]> = {
  // Desi
  carts: ['chicagochaicart', 'chicagopanipuri', 'chicagopaancart', 'chicagokulficart'],
  mehndi: ['chicagomehndi', 'chicagomehndiartist', 'chicagohennaartist', 'chicagohenna'],
  hair_makeup: [
    'chicagodesimua',
    'chicagoshaadimua',
    'chicagoarabbridalmua',
    'chicagomuslimbridalmua',
  ],
  dj: ['chicagoshaadidj', 'chicagodesidj', 'chicagoarabdj'],
  decor: ['chicagoshaadidecor', 'chicagodesiweddingdecor', 'chicagoarabweddingdecor'],
  photography: [
    'chicagodesiPhotographer',
    'chicagoshaadiphotographer',
    'chicagoarabweddingphotographer',
    'chicagolebaneseweddingphotographer',
  ],
  videography: [
    'chicagodesivideographer',
    'chicagoshaadivideographer',
    'chicagoarabweddingvideographer',
  ],
  venue: ['chicagoshaadivenue', 'chicagodesiweddingvenue', 'chicagoarabweddingvenue'],
  live_music: ['chicagodholplayer', 'chicagobaraat', 'chicagozaffa'],
};

// Top desi wedding venues in Chicago metro — for Layer 2 (location-tagged scraping)
export const VENUE_LOCATIONS = [
  'Drury Lane Theatre Oakbrook Terrace',
  'Royal Banquets Chicago',
  'The Cotillion Banquets',
  'Belvedere Banquets Elk Grove Village',
  'Embassy Banquets Hanover Park',
  'Cocoa Banquet Lombard',
  'Carlisle Banquets Lombard',
  'Naperville Country Club',
  'Hotel Arista Naperville',
];
