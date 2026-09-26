CREATE TABLE IF NOT EXISTS link_visits (
  id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  url text NOT NULL,
  callback_url text NOT NULL,
  visited_at timestamptz NOT NULL,
  callback_status text NOT NULL CHECK (callback_status IN ('success', 'failed')),
  callback_error text,
  screenshot_url text,
  ocr_text text,
  embedding vector(1536)
);

CREATE INDEX IF NOT EXISTS link_visits_embedding_hnsw
  ON link_visits USING hnsw (embedding vector_cosine_ops);
