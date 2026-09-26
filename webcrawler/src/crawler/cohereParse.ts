import { Jimp } from 'jimp';

const PARSE_URL = 'https://api.cohere.com/v2/parse';
const PARSE_MODEL = 'parse-v5.0';
const MAX_SLICE_HEIGHT = 4000;
const MAX_SLICES = 8;
const JPEG_QUALITY = 75;

export interface ImageCrop {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Fit a crop to the image. Returns null when the region does not overlap the image. */
export function clampCrop(imageWidth: number, imageHeight: number, crop: ImageCrop): ImageCrop | null {
  if (![crop.x, crop.y, crop.width, crop.height].every((value) => Number.isFinite(value))) return null;
  if (crop.width < 1 || crop.height < 1 || imageWidth < 1 || imageHeight < 1) return null;

  const x = Math.max(0, Math.min(imageWidth - 1, Math.floor(crop.x)));
  const y = Math.max(0, Math.min(imageHeight - 1, Math.floor(crop.y)));
  const right = Math.min(imageWidth, Math.floor(crop.x + crop.width));
  const bottom = Math.min(imageHeight, Math.floor(crop.y + crop.height));
  const width = right - x;
  const height = bottom - y;
  if (width < 1 || height < 1) return null;
  return { x, y, width, height };
}

export function cohereApiKey(): string | undefined {
  const key = process.env.COHERE_API_KEY || process.env.CO_API_KEY;
  const trimmed = key?.trim();
  return trimmed ? trimmed : undefined;
}

/** Join markdown pages from a Cohere Parse response. */
export function markdownFromParseResponse(body: unknown): string {
  if (!body || typeof body !== 'object') return '';
  const pages = (body as { pages?: unknown }).pages;
  if (!Array.isArray(pages)) return '';

  const parts: string[] = [];
  for (const page of pages) {
    if (!page || typeof page !== 'object') continue;
    const markdown = (page as { markdown?: { content?: unknown } }).markdown;
    if (typeof markdown?.content === 'string' && markdown.content.trim()) {
      parts.push(markdown.content.trim());
    }
  }
  return parts.join('\n\n');
}

/**
 * Split a screenshot into JPEG slices small enough for Cohere Parse
 * (20 MB upload, 50 megapixels decoded).
 */
export async function screenshotJpegSlices(
  imagePath: string,
  maxSliceHeight: number = MAX_SLICE_HEIGHT,
  crop?: ImageCrop,
): Promise<Buffer[]> {
  let image = await Jimp.read(imagePath);
  if (crop) {
    const clamped = clampCrop(image.width, image.height, crop);
    if (!clamped) {
      throw new Error('That crop is outside the screenshot.');
    }
    image = image.clone().crop({ x: clamped.x, y: clamped.y, w: clamped.width, h: clamped.height }) as typeof image;
  }
  const sliceHeight = Math.max(1, maxSliceHeight);
  const slices: Buffer[] = [];
  const limit = Math.min(MAX_SLICES, Math.ceil(image.height / sliceHeight));

  for (let index = 0; index < limit; index += 1) {
    const y = index * sliceHeight;
    const height = Math.min(sliceHeight, image.height - y);
    const slice = image.clone().crop({ x: 0, y, w: image.width, h: height });
    const buffer = await slice.getBuffer('image/jpeg', { quality: JPEG_QUALITY });
    slices.push(buffer);
  }

  return slices;
}

async function parseJpeg(jpeg: Buffer, apiKey: string): Promise<string> {
  const dataUri = `data:image/jpeg;base64,${jpeg.toString('base64')}`;
  const response = await fetch(PARSE_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'X-Client-Name': 'spyber-man',
    },
    body: JSON.stringify({
      model: PARSE_MODEL,
      document: { type: 'image_url', image_url: dataUri },
      output_format: 'markdown',
    }),
    signal: AbortSignal.timeout(60_000),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new Error(`Cohere parse failed (${response.status}): ${detail.slice(0, 500)}`);
  }

  return markdownFromParseResponse(await response.json());
}

export interface ParseSliceProgress {
  index: number;
  total: number;
}

/**
 * Parse a crawl screenshot with Cohere and return markdown.
 * Throws when the key is missing or the request fails.
 */
export async function parseScreenshot(
  imagePath: string,
  onSlice?: (progress: ParseSliceProgress) => void | Promise<void>,
  crop?: ImageCrop,
): Promise<string> {
  const apiKey = cohereApiKey();
  if (!apiKey) {
    throw new Error('COHERE_API_KEY is not set. Add it to the workspace .env.');
  }

  const slices = await screenshotJpegSlices(imagePath, MAX_SLICE_HEIGHT, crop);
  const pages: string[] = [];
  for (let index = 0; index < slices.length; index += 1) {
    await onSlice?.({ index, total: slices.length });
    const markdown = await parseJpeg(slices[index], apiKey);
    if (markdown) pages.push(markdown);
  }
  if (pages.length === 0) {
    throw new Error('Cohere returned no markdown for that screenshot.');
  }

  const image = await Jimp.read(imagePath);
  const region = crop ? clampCrop(image.width, image.height, crop) : null;
  const parsedHeight = region?.height ?? image.height;
  const truncated = parsedHeight > MAX_SLICE_HEIGHT * MAX_SLICES;
  const combined = pages.join('\n\n');
  return truncated ? `${combined}\n\n_The rest of the screenshot was not parsed._` : combined;
}
