import { replaceRagChunks } from './database';

const EMBEDDING_MODEL = 'text-embedding-ada-002';
const EMBEDDING_DIMENSIONS = 1536;
const CHUNK_CHARS = 1500;
const OVERLAP_CHARS = 200;
const EMBEDDINGS_URL = 'https://api.openai.com/v1/embeddings';

/** Split parsed page text into overlapping chunks that fit an embedding request. */
export function chunkParsedContent(text: string): string[] {
  const normalized = text.replace(/\r\n/g, '\n').trim();
  if (!normalized) return [];

  const chunks: string[] = [];
  let current = '';

  const pushLong = (piece: string) => {
    const step = CHUNK_CHARS - OVERLAP_CHARS;
    for (let start = 0; start < piece.length; start += step) {
      const slice = piece.slice(start, start + CHUNK_CHARS).trim();
      if (slice) chunks.push(slice);
      if (start + CHUNK_CHARS >= piece.length) break;
    }
  };

  for (const paragraph of normalized.split(/\n{2,}/)) {
    const piece = paragraph.trim();
    if (!piece) continue;
    if (piece.length > CHUNK_CHARS) {
      if (current) {
        chunks.push(current);
        current = '';
      }
      pushLong(piece);
      continue;
    }

    const next = current ? `${current}\n\n${piece}` : piece;
    if (next.length <= CHUNK_CHARS) {
      current = next;
      continue;
    }

    chunks.push(current);
    const tail = current.slice(-OVERLAP_CHARS).trim();
    current = tail ? `${tail}\n\n${piece}` : piece;
  }

  if (current) chunks.push(current);
  return chunks;
}

function openaiApiKey(): string {
  const key = process.env.OPENAI_API_KEY?.trim();
  if (!key) {
    throw new Error('OPENAI_API_KEY is not set. Add it to the workspace .env.');
  }
  return key;
}

/** Embed chunk texts with OpenAI text-embedding-ada-002. */
export async function embedTexts(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return [];

  const response = await fetch(EMBEDDINGS_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${openaiApiKey()}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ model: EMBEDDING_MODEL, input: texts }),
    signal: AbortSignal.timeout(60_000),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new Error(`OpenAI embeddings failed (${response.status}): ${detail.slice(0, 500)}`);
  }

  const body = (await response.json()) as {
    data?: Array<{ index?: number; embedding?: number[] }>;
  };
  const rows = Array.isArray(body.data) ? body.data : [];
  const ordered = rows
    .slice()
    .sort((left, right) => (left.index ?? 0) - (right.index ?? 0))
    .map((row) => row.embedding);

  if (ordered.length !== texts.length || ordered.some((vector) => !Array.isArray(vector) || vector.length !== EMBEDDING_DIMENSIONS)) {
    throw new Error(`OpenAI returned embeddings that are not ${EMBEDDING_DIMENSIONS}-dimensional.`);
  }

  return ordered as number[][];
}

/** Replace the rag chunks for one parsed visit. Returns how many chunks were stored. */
export async function indexParsedContent(
  linkVisitId: number,
  url: string,
  markdown: string,
): Promise<number> {
  const chunks = chunkParsedContent(markdown);
  const embeddings = await embedTexts(chunks);
  await replaceRagChunks(
    linkVisitId,
    url,
    chunks.map((content, index) => ({
      index,
      content,
      embedding: embeddings[index],
    })),
  );
  return chunks.length;
}
