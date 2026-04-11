import { describe, expect, it } from 'vitest';
import { cleanName } from './clean';

describe('cleanName', () => {
  describe('pass-throughs', () => {
    it('returns a plain title unchanged', () => {
      expect(cleanName('Song')).toBe('Song');
    });

    it('returns an empty string unchanged', () => {
      expect(cleanName('')).toBe('');
    });

    it('preserves internal hyphens in a single word', () => {
      expect(cleanName('Self-Aware')).toBe('Self-Aware');
    });

    it('preserves hyphenated words inside a longer title', () => {
      expect(cleanName('Happy-Go-Lucky Anthem')).toBe('Happy-Go-Lucky Anthem');
    });

    it('leaves a hyphen with no surrounding whitespace alone', () => {
      expect(cleanName('Merry-Go-Round')).toBe('Merry-Go-Round');
    });
  });

  describe('parenthetical metadata', () => {
    it('strips (Remastered)', () => {
      expect(cleanName('Song (Remastered)')).toBe('Song');
    });

    it('strips (Remastered 2009)', () => {
      expect(cleanName('Song (Remastered 2009)')).toBe('Song');
    });

    it('strips (2007 Remastered Version)', () => {
      expect(cleanName('Song (2007 Remastered Version)')).toBe('Song');
    });

    it('strips (Live at Wembley)', () => {
      expect(cleanName('Song (Live at Wembley)')).toBe('Song');
    });

    it('strips (Bonus Track Version)', () => {
      expect(cleanName('Song (Bonus Track Version)')).toBe('Song');
    });

    it('strips (Deluxe Edition) from an album', () => {
      expect(cleanName('The Album (Deluxe Edition)')).toBe('The Album');
    });
  });

  describe('bracketed metadata', () => {
    it('strips [Live]', () => {
      expect(cleanName('Song [Live]')).toBe('Song');
    });

    it('strips [Deluxe Edition]', () => {
      expect(cleanName('The Album [Deluxe Edition]')).toBe('The Album');
    });
  });

  describe('trailing dash metadata', () => {
    it('strips " - Live"', () => {
      expect(cleanName('Song - Live')).toBe('Song');
    });

    it('strips " - 2007 Remastered Version"', () => {
      expect(cleanName('Song - 2007 Remastered Version')).toBe('Song');
    });

    it('strips " - Single Version"', () => {
      expect(cleanName('Song - Single Version')).toBe('Song');
    });

    it('strips an en-dash separator', () => {
      expect(cleanName('Song – Remastered')).toBe('Song');
    });
  });

  describe('regression: commit 0325656 — preserve internal hyphens', () => {
    it('does not strip after a hyphenated word', () => {
      expect(cleanName('Self-Aware Song')).toBe('Self-Aware Song');
    });

    it('does not strip after an X-Ray style word', () => {
      expect(cleanName('X-Ray Eyes')).toBe('X-Ray Eyes');
    });

    it('still strips trailing metadata on a title containing a hyphenated word', () => {
      expect(cleanName('Self-Aware Song - Remastered')).toBe('Self-Aware Song');
    });

    it('does not swallow a hyphenated word when a trailing keyword follows a dash', () => {
      expect(cleanName('X-Ray - Live')).toBe('X-Ray');
    });
  });

  describe('multiple metadata markers', () => {
    it('strips both parenthetical and bracketed metadata', () => {
      expect(cleanName('Song (Remastered) [Bonus Track]')).toBe('Song');
    });
  });

  describe('case insensitivity', () => {
    it('strips (REMASTERED)', () => {
      expect(cleanName('Song (REMASTERED)')).toBe('Song');
    });

    it('strips " - LIVE"', () => {
      expect(cleanName('Song - LIVE')).toBe('Song');
    });
  });

  describe('whitespace handling', () => {
    it('trims trailing whitespace after removing metadata', () => {
      expect(cleanName('Song (Remastered)   ')).toBe('Song');
    });
  });
});
