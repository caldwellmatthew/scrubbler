const KEYWORDS =
  'remaster(?:ed|ing)?|stereo(?:\\s+(?:mix|version))?|mono(?:\\s+mix)?' +
  '|deluxe(?:\\s+edition)?|special\\s+edition' +
  '|bonus\\s+track(?:\\s+version)?' +
  '|live|radio\\s+edit' +
  '|single\\s+(?:version|edit|mix)' +
  '|anniversary(?:\\s+edition)?|expanded(?:\\s+edition)?';

const PAREN   = new RegExp(`\\s*\\([^)]*\\b(?:${KEYWORDS})\\b[^)]*\\)`, 'gi');
const BRACKET = new RegExp(`\\s*\\[[^\\]]*\\b(?:${KEYWORDS})\\b[^\\]]*\\]`, 'gi');

const METADATA_SEGMENT = new RegExp(`^(?:.*\\s+)?(?:${KEYWORDS})(?:\\s+(?:\\d{4}|\\w+))*\\s*$`, 'i');

export function cleanName(s: string): string {
  let out = s.replace(PAREN, '').replace(BRACKET, '');
  // A trailing segment can be a real subtitle, so stop at the first that isn't metadata.
  for (let sep = lastSeparator(out); sep !== null; sep = lastSeparator(out)) {
    if (!METADATA_SEGMENT.test(out.slice(sep.end))) break;
    out = out.slice(0, sep.start);
  }
  return out.trim();
}

function lastSeparator(s: string): { start: number; end: number } | null {
  const separator = /\s+[-–]\s+/g;
  let last: { start: number; end: number } | null = null;
  for (let m = separator.exec(s); m !== null; m = separator.exec(s)) {
    last = { start: m.index, end: m.index + m[0].length };
  }
  return last;
}
