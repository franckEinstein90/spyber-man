import fs from 'fs';
import path from 'path';
import { Jimp } from 'jimp';

/**
 * Tesseract rejects very tall full-page screenshots ("Image too large").
 * Cap the longest side so OCR stays within safe bounds.
 */
export const OCR_MAX_DIMENSION = 3500;

/**
 * Write a downscaled copy of `sourcePath` for OCR and return its path.
 * If the image is already small enough, returns `sourcePath` unchanged.
 */
export async function prepareImageForOcr(sourcePath: string): Promise<string> {
  const image = await Jimp.read(sourcePath);
  const longest = Math.max(image.width, image.height);

  if (longest <= OCR_MAX_DIMENSION) {
    return sourcePath;
  }

  const scale = OCR_MAX_DIMENSION / longest;
  const width = Math.max(1, Math.round(image.width * scale));
  const height = Math.max(1, Math.round(image.height * scale));
  image.resize({ w: width, h: height });

  const parsed = path.parse(sourcePath);
  const ocrPath = path.join(parsed.dir, `${parsed.name}.ocr${parsed.ext}`);
  await image.write(ocrPath as `${string}.${string}`);
  return ocrPath;
}

/** Best-effort cleanup of temporary OCR-only image copies. */
export function cleanupOcrTempImage(originalPath: string, ocrPath: string): void {
  if (ocrPath === originalPath) {
    return;
  }
  try {
    fs.unlinkSync(ocrPath);
  } catch {
    // ignore missing/locked temp files
  }
}
