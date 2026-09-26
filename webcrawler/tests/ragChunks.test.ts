import { describe, expect, it } from 'vitest';

import { chunkParsedContent } from '../src/server/rag';

describe('chunkParsedContent', () => {
  it('returns nothing for blank text', () => {
    expect(chunkParsedContent('   \n\n  ')).toEqual([]);
  });

  it('keeps a short page as one chunk', () => {
    expect(chunkParsedContent('# Title\n\nA short paragraph.')).toEqual(['# Title\n\nA short paragraph.']);
  });

  it('splits a long paragraph into overlapping chunks', () => {
    const text = 'word '.repeat(800).trim();
    const chunks = chunkParsedContent(text);
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.every((chunk) => chunk.length <= 1500)).toBe(true);
    expect(chunks[1].startsWith(chunks[0].slice(-200).trim().slice(0, 20))).toBe(true);
  });
});