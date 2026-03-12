const KEYWORDS =
  'remaster(?:ed|ing)?|stereo(?:\\s+(?:mix|version))?|mono(?:\\s+mix)?' +
  '|deluxe(?:\\s+edition)?|special\\s+edition' +
  '|bonus\\s+track(?:\\s+version)?' +
  '|live|radio\\s+edit' +
  '|single\\s+(?:version|edit|mix)' +
  '|anniversary(?:\\s+edition)?|expanded(?:\\s+edition)?';

const PAREN   = new RegExp(`\\s*\\([^)]*\\b(?:${KEYWORDS})\\b[^)]*\\)`, 'gi');
const BRACKET = new RegExp(`\\s*\\[[^\\]]*\\b(?:${KEYWORDS})\\b[^\\]]*\\]`, 'gi');
const DASH    = new RegExp(`\\s*[-–]\\s*(?:.*\\s+)?(?:${KEYWORDS})(?:\\s+(?:\\d{4}|\\w+))*\\s*$`, 'gi');

export function cleanName(s: string): string {
  return s.replace(PAREN, '').replace(BRACKET, '').replace(DASH, '').trim();
}
