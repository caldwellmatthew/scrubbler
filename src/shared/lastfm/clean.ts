// Markers of a version or edition that never make a release distinct, so stripped from tracks and albums alike
const EDITION_KEYWORDS =
  'remaster(?:ed|ing)?|stereo(?:\\s+(?:mix|version))?|mono(?:\\s+mix)?' +
  '|deluxe(?:\\s+edition)?|special\\s+edition' +
  '|bonus\\s+track(?:\\s+version)?' +
  '|radio\\s+edit' +
  '|single\\s+(?:version|edit|mix)' +
  '|anniversary(?:\\s+edition)?|expanded(?:\\s+edition)?';

// A live track is the same song, but a live album is a different release from the studio one
const TRACK_KEYWORDS = `${EDITION_KEYWORDS}|live`;

function cleaner(keywords: string): (s: string) => string {
  const paren = new RegExp(`\\s*\\([^)]*\\b(?:${keywords})\\b[^)]*\\)`, 'gi');
  const bracket = new RegExp(`\\s*\\[[^\\]]*\\b(?:${keywords})\\b[^\\]]*\\]`, 'gi');
  const metadataSegment = new RegExp(`^(?:.*\\s+)?(?:${keywords})(?:\\s+(?:\\d{4}|\\w+))*\\s*$`, 'i');

  return (s) => {
    let out = s.replace(paren, '').replace(bracket, '');
    // A trailing segment can be a real subtitle, so stop at the first that isn't metadata.
    for (let sep = lastSeparator(out); sep !== null; sep = lastSeparator(out)) {
      if (!metadataSegment.test(out.slice(sep.end))) break;
      out = out.slice(0, sep.start);
    }
    return out.trim();
  };
}

/** Strip release metadata from a track title. */
export const cleanName = cleaner(TRACK_KEYWORDS);

/** Strip edition metadata from an album title, keeping what marks a distinct release. */
export const cleanAlbumName = cleaner(EDITION_KEYWORDS);

function lastSeparator(s: string): { start: number; end: number } | null {
  const separator = /\s+[-–]\s+/g;
  let last: { start: number; end: number } | null = null;
  for (let m = separator.exec(s); m !== null; m = separator.exec(s)) {
    last = { start: m.index, end: m.index + m[0].length };
  }
  return last;
}
