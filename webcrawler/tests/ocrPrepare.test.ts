import path from 'path';
import fs from 'fs';
import { afterEach, describe, expect, it } from 'vitest';
import { Jimp } from 'jimp';

import {
  OCR_MAX_DIMENSION,
  prepareImageForOcr,
  cleanupOcrTempImage,
} from '../src/crawler/ocrPrepare';

const tmpDir = path.join(process.cwd(), 'screenGrabs', '_ocr-prep-test');

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('ocrPrepare', () => {
  it('returns the original path when the image is already small enough', async () => {
    fs.mkdirSync(tmpDir, { recursive: true });
    const source = path.join(tmpDir, 'small.png');
    const image = new Jimp({ width: 200, height: 100, color: 0xffffffff });
    await image.write(source as `${string}.png`);

    const prepared = await prepareImageForOcr(source);
    expect(prepared).toBe(source);
  });

  it('writes a downscaled .ocr.png copy for oversized images', async () => {
    fs.mkdirSync(tmpDir, { recursive: true });
    const source = path.join(tmpDir, 'tall.png');
    const image = new Jimp({
      width: 1280,
      height: OCR_MAX_DIMENSION + 5000,
      color: 0xffffffff,
    });
    await image.write(source as `${string}.png`);

    const prepared = await prepareImageForOcr(source);
    expect(prepared).not.toBe(source);
    expect(prepared.endsWith('.ocr.png')).toBe(true);

    const resized = await Jimp.read(prepared);
    expect(Math.max(resized.width, resized.height)).toBeLessThanOrEqual(
      OCR_MAX_DIMENSION,
    );

    cleanupOcrTempImage(source, prepared);
    expect(fs.existsSync(prepared)).toBe(false);
  });
});
