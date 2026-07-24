import { createWorker, type Worker } from 'tesseract.js';

import { cleanupOcrTempImage, prepareImageForOcr } from './ocrPrepare';

/**
 * Shared Tesseract worker for screenshot OCR.
 * Lazily created and reusable across a crawl batch.
 */
let worker: Worker | null = null;
let workerInit: Promise<Worker> | null = null;

async function getWorker(): Promise<Worker> {
  if (worker) {
    return worker;
  }
  if (!workerInit) {
    workerInit = (async () => {
      const created = await createWorker('eng');
      worker = created;
      return created;
    })().catch((error) => {
      workerInit = null;
      throw error;
    });
  }
  return workerInit;
}

/**
 * Run OCR on a local image file and return extracted text.
 * Oversized screenshots are downscaled first (Tesseract rejects huge images).
 * Returns an empty string when no text is detected.
 */
export async function extractTextFromImage(imagePath: string): Promise<string> {
  const ocrPath = await prepareImageForOcr(imagePath);
  try {
    const ocr = await getWorker();
    const {
      data: { text },
    } = await ocr.recognize(ocrPath);
    return text.replace(/\r\n/g, '\n').trim();
  } finally {
    cleanupOcrTempImage(imagePath, ocrPath);
  }
}

/** Tear down the shared OCR worker (call when a crawl batch finishes). */
export async function closeOcrWorker(): Promise<void> {
  if (worker) {
    await worker.terminate();
    worker = null;
  }
  workerInit = null;
}
