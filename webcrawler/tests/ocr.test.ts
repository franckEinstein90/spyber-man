import path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const recognize = vi.fn();
const terminate = vi.fn();
const createWorker = vi.fn(async () => ({
  recognize,
  terminate,
}));

vi.mock('tesseract.js', () => ({
  createWorker: (...args: unknown[]) => createWorker(...args),
}));

vi.mock('../src/crawler/ocrPrepare', () => ({
  prepareImageForOcr: vi.fn(async (imagePath: string) => imagePath),
  cleanupOcrTempImage: vi.fn(),
  OCR_MAX_DIMENSION: 3500,
}));

describe('ocr', () => {
  beforeEach(() => {
    recognize.mockReset();
    terminate.mockReset();
    createWorker.mockClear();
    recognize.mockResolvedValue({ data: { text: '  Hello OCR  \n' } });
  });

  afterEach(async () => {
    const { closeOcrWorker } = await import('../src/crawler/ocr');
    await closeOcrWorker();
    vi.resetModules();
  });

  it('extracts trimmed text from an image via tesseract', async () => {
    const { extractTextFromImage } = await import('../src/crawler/ocr');

    const text = await extractTextFromImage(
      path.join('screenGrabs', 'example.png'),
    );
    expect(text).toBe('Hello OCR');
    expect(recognize).toHaveBeenCalledTimes(1);
    expect(createWorker).toHaveBeenCalledTimes(1);
  });

  it('reuses a single worker across calls', async () => {
    const { extractTextFromImage } = await import('../src/crawler/ocr');

    await extractTextFromImage('a.png');
    await extractTextFromImage('b.png');
    expect(createWorker).toHaveBeenCalledTimes(1);
    expect(recognize).toHaveBeenCalledTimes(2);
  });
});
