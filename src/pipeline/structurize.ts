/**
 * structurize() — extracts structured metadata from markdown content.
 *
 * Uses LLM to extract title, summary, keyPoints, and candidate tags.
 * Output is JSON-parsed from LLM response.
 */

import { completeSimple } from '@mariozechner/pi-ai';
import type { Model } from '@mariozechner/pi-ai';
import { STRUCTURIZE_SYSTEM_PROMPT, buildStructurizePrompt } from './prompts.js';
import type { StructurizeInput, StructurizeOutput } from './types.js';

/** Extract text content from an AssistantMessage */
function extractText(content: Array<{ type: string; text?: string }>): string {
  return content
    .filter((c) => c.type === 'text' && c.text)
    .map((c) => c.text!)
    .join('');
}

/** Parse JSON from LLM response, handling markdown code fences */
function parseJsonResponse(text: string): StructurizeOutput {
  // Strip markdown code fences if present
  let cleaned = text.trim();
  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
  }

  const parsed = JSON.parse(cleaned);

  return {
    title: parsed.title ?? 'Untitled',
    summary: parsed.summary ?? '',
    keyPoints: Array.isArray(parsed.keyPoints) ? parsed.keyPoints : [],
    tags: Array.isArray(parsed.tags) ? parsed.tags : [],
  };
}

/** Extract structured information from markdown content */
export async function structurize(
  input: StructurizeInput,
  model: Model<'openai-completions'>,
): Promise<StructurizeOutput> {
  const prompt = buildStructurizePrompt(input.content, input.hints);

  const result = await completeSimple(model, {
    systemPrompt: STRUCTURIZE_SYSTEM_PROMPT,
    messages: [{ role: 'user', content: prompt, timestamp: Date.now() }],
  });

  const text = extractText(result.content as Array<{ type: string; text?: string }>);
  return parseJsonResponse(text);
}
