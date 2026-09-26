import { ragChunkCount, recordAppLog, searchRagChunks, type SimilarChunk } from './database';
import { embedTexts } from './rag';

const ANSWER_MODEL = 'gpt-4o-mini';
const MAX_DISTANCE = 0.55;
const TOP_CHUNKS = 6;

export interface ConversationTurn {
  role: 'user' | 'assistant';
  text: string;
}

export interface KnowledgeAnswer {
  answer: string;
  sources: string[];
}

function normalizeHistory(history: ConversationTurn[]): ConversationTurn[] {
  return history
    .filter((turn) => (turn.role === 'user' || turn.role === 'assistant') && turn.text.trim())
    .slice(-6)
    .map((turn) => ({ role: turn.role, text: turn.text.trim().slice(0, 8000) }));
}

function retrievalText(question: string, history: ConversationTurn[]): string {
  const prior = history
    .filter((turn) => turn.role === 'user')
    .slice(-3)
    .map((turn) => turn.text);
  return [...prior, question].join('\n');
}

function passages(chunks: SimilarChunk[]): string {
  return chunks
    .map((chunk, index) => `[${index + 1}] ${chunk.url}\n${chunk.content}`)
    .join('\n\n');
}

async function completeAnswer(
  question: string,
  history: ConversationTurn[],
  chunks: SimilarChunk[],
  attachmentText: string,
): Promise<string> {
  const key = process.env.OPENAI_API_KEY?.trim();
  if (!key) {
    throw new Error('OPENAI_API_KEY is not set. Add it to the workspace .env.');
  }

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: ANSWER_MODEL,
      temperature: 0.2,
      messages: [
        {
          role: 'system',
          content: [
            'Answer using only the stored passages and any attached files below.',
            'If neither contains the answer, say you do not have that.',
            'Do not add facts from outside those sources.',
            ...(chunks.length > 0
              ? ['Mention the page URL when you use a passage.', '', passages(chunks)]
              : []),
            ...(attachmentText ? ['', 'Attached files:', attachmentText] : []),
          ].join('\n'),
        },
        ...history.map((turn) => ({ role: turn.role, content: turn.text })),
        { role: 'user', content: question },
      ],
    }),
    signal: AbortSignal.timeout(60_000),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new Error(`OpenAI answer failed (${response.status}): ${detail.slice(0, 500)}`);
  }

  const body = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const answer = body.choices?.[0]?.message?.content?.trim();
  if (!answer) {
    throw new Error('OpenAI returned an empty answer.');
  }
  return answer;
}

/** Answer a question from parsed page chunks, using recent chat turns for follow-ups. */
export async function answerFromKnowledge(
  question: string,
  history: ConversationTurn[] = [],
  attachmentText = '',
): Promise<KnowledgeAnswer> {
  const started = Date.now();
  const trimmed = question.trim();
  const attached = attachmentText.trim().slice(0, 24_000);
  if (!trimmed && !attached) {
    return { answer: 'Ask a question about a page that has been parsed.', sources: [] };
  }

  const turns = normalizeHistory(history);
  const storedPages = (await ragChunkCount()) > 0;
  if (!storedPages && !attached) {
    const answer = 'I do not have any parsed pages stored yet. Crawl a page, then ask me to parse the screenshot.';
    await recordAppLog({
      level: 'info',
      source: 'crawler',
      event: 'ask.empty',
      message: trimmed.slice(0, 300),
      durationMs: Date.now() - started,
    });
    return { answer, sources: [] };
  }

  let chunks: SimilarChunk[] = [];
  if (storedPages && trimmed) {
    try {
      const [embedding] = await embedTexts([retrievalText(trimmed, turns)]);
      const nearest = await searchRagChunks(embedding, TOP_CHUNKS);
      chunks = nearest.filter((chunk) => chunk.distance <= MAX_DISTANCE);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await recordAppLog({
        level: 'error',
        source: 'crawler',
        event: 'ask.failed',
        message,
        durationMs: Date.now() - started,
      });
      throw error;
    }
  }

  if (chunks.length === 0 && !attached) {
    const answer = 'I do not have that in the stored pages. Crawl a page and parse the screenshot before asking about it.';
    await recordAppLog({
      level: 'info',
      source: 'crawler',
      event: 'ask.empty',
      message: trimmed.slice(0, 300),
      durationMs: Date.now() - started,
    });
    return { answer, sources: [] };
  }

  const answer = await completeAnswer(trimmed || 'What is in the attached files?', turns, chunks, attached);
  const sources = [...new Set(chunks.map((chunk) => chunk.url))];
  await recordAppLog({
    level: 'info',
    source: 'crawler',
    event: 'ask.answered',
    message: trimmed.slice(0, 300),
    durationMs: Date.now() - started,
    details: { sources, chunks: chunks.length },
  });
  return { answer, sources };
}
