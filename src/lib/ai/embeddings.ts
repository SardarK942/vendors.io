import OpenAI from 'openai';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });

/**
 * Generate an embedding vector for a given text using text-embedding-3-small.
 * Cost: ~$0.00002 per 1K tokens ($1 per 50M tokens).
 */
export async function generateEmbedding(text: string): Promise<number[]> {
  const response = await openai.embeddings.create({
    model: 'text-embedding-3-small',
    input: text.slice(0, 8000), // Cap input to avoid token limit
  });

  return response.data[0].embedding;
}

/**
 * Generate embeddings for multiple texts in a batch.
 * More efficient than individual calls for bulk operations.
 */
export async function generateEmbeddingsBatch(texts: string[]): Promise<number[][]> {
  const response = await openai.embeddings.create({
    model: 'text-embedding-3-small',
    input: texts.map((t) => t.slice(0, 8000)),
  });

  return response.data.map((d) => d.embedding);
}
