import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, describe, expect, it } from 'vitest';
import { Jimp } from 'jimp';

import { markdownFromParseResponse, screenshotJpegSlices } from '../src/crawler/cohereParse';

const tmpFiles: string[] = [];

afterEach(() => {
  for (const file of tmpFiles.splice(0)) {
    fs.rmSync(file, { force: true });
  }
});

describe('cohereParse', () => {
  it('joins markdown pages from a parse response', () => {
    const markdown = markdownFromParseResponse({
      pages: [
        { markdown: { content: '  # Hello  ' } },
        { markdown: { content: 'Second page' } },
        { markdown: { content: '   ' } },
      ],
    });
    expect(markdown).toBe('# Hello\n\nSecond page');
  });

  it('splits a tall screenshot into jpeg slices', async () => {
    const image = new Jimp({ width: 40, height: 90, color: 0xffffffff });
    const file = path.join(os.tmpdir(), `spyber-parse-${Date.now()}.png`);
    tmpFiles.push(file);
    await image.write(file as `${string}.png`);

    const slices = await screenshotJpegSlices(file, 40);
    expect(slices).toHaveLength(3);
    expect(slices.every((slice) => slice[0] === 0xff && slice[1] === 0xd8)).toBe(true);
  });
});