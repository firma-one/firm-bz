import { logger } from './logger'

// We use Transformers.js for free, local embeddings.
// Model 'all-MiniLM-L6-v2' is 384-dimensional and highly optimized for retrieval.
let pipelineInstance: any = null

async function getPipeline() {
    if (!pipelineInstance) {
        const { pipeline } = await import('@xenova/transformers')
        pipelineInstance = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2')
    }
    return pipelineInstance
}

/**
 * Generate a vector embedding for the given text using local Transformers.js.
 * @param text The text to embed (e.g., a filename)
 * @returns An array of numbers representing the embedding vector (384 dimensions)
 */
export async function generateEmbedding(text: string): Promise<number[]> {
    try {
        const generate = await getPipeline()
        // Compute features
        const output = await generate(text.replace(/\n/g, ' '), {
            pooling: 'mean',
            normalize: true
        })

        // output is a Tensor. Converting to plain array.
        return Array.from(output.data)
    } catch (error) {
        logger.error('Failed to generate local embedding:', error as Error)
        throw error
    }
}

/**
 * The model reads about 256 tokens (some 200 words); what's past that is ignored, so a long
 * description is cut here rather than let it crowd the name out of what the model sees.
 */
const MAX_DESCRIPTION_CHARS = 1000

/**
 * Clean and combine file name and other metadata for better embedding. The description is the one
 * the firm wrote in Firma's Details pane (2026-10-29): their own words for what the file is, so a
 * search by meaning can find it by what it's for, not just by what it's called.
 */
export function prepareTextForEmbedding(fileName: string, summary?: string | null, description?: string | null): string {
    const cleanName = fileName.trim()
    const cleanDescription = description?.trim().slice(0, MAX_DESCRIPTION_CHARS)
    if (!summary && !cleanDescription) return cleanName
    // Append description and summary for richer vector representation
    return [
        `File: ${cleanName}`,
        ...(cleanDescription ? [`Description: ${cleanDescription}`] : []),
        ...(summary ? [`Summary: ${summary.trim()}`] : []),
    ].join(' | ')
}
