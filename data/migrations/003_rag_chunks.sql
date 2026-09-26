CREATE SCHEMA IF NOT EXISTS rag;

CREATE TABLE IF NOT EXISTS rag.chunks (
  id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  link_visit_id integer NOT NULL REFERENCES public.link_visits (id) ON DELETE CASCADE,
  url text NOT NULL,
  chunk_index integer NOT NULL,
  content text NOT NULL,
  embedding vector(1536) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (link_visit_id, chunk_index)
);

CREATE INDEX IF NOT EXISTS rag_chunks_embedding_hnsw
  ON rag.chunks USING hnsw (embedding vector_cosine_ops);
