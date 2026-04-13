/**
 * merge() — combines overlapping memories into one comprehensive entry.
 *
 * Uses LLM to merge content while preserving all facts.
 * Superseded memories are kept for audit trail.
 */

import { completeSimple } from '@mariozechner/pi-ai';
import type { Model } from '@mariozechner/pi-ai';
import { MERGE_SYSTEM_PROMPT, buildMergePrompt } from './prompts.js';
import type { MergeInput, MergeOutput } from './types.js';
import type { Memory } from '../core/storage/types.js';

/** Extract text content from an AssistantMessage */
function extractText(content: Array<{ type: string; text?: string }>): string {
  return content
    .filter((c) => c.type === 'text' && c.text)
    .map((c) => c.text!)
    .join('');
}

interface LlmMergeResponse {
  content: string;
  title: string;
  summary: string;
  keyPoints: string[];
  tags: string[];
  confidence: number;
  reason: string;
}

/** Parse JSON from LLM response */
function parseJsonResponse(text: string): LlmMergeResponse {
  let cleaned = text.trim();
  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
  }
  return JSON.parse(cleaned);
}

/** Merge overlapping memories */
export async function merge(
  input: MergeInput,
  model: Model<'openai-completions'>,
): Promise<MergeOutput> {
  const { memories, newContent, strategy = 'auto' } = input;

  if (memories.length === 0) {
    return {
      action: 'kept_separate',
      supersededIds: [],
      reason: 'No memories to merge.',
    };
  }

  // append strategy: keep all memories, don't merge
  if (strategy === 'append') {
    return {
      action: 'kept_separate',
      supersededIds: [],
      reason: 'Append strategy: keeping all memories separate.',
    };
  }

  // Build LLM prompt
  const memData = memories.map((m) => ({
    id: m.id,
    content: m.content,
    summary: m.summary,
  }));
  const prompt = buildMergePrompt(memData, newContent);

  const result = await completeSimple(model, {
    systemPrompt: MERGE_SYSTEM_PROMPT,
    messages: [{ role: 'user', content: prompt, timestamp: Date.now() }],
  });

  const text = extractText(result.content as Array<{ type: string; text?: string }>);
  const parsed = parseJsonResponse(text);

  // supersede strategy: new content replaces old
  if (strategy === 'supersede') {
    return {
      action: 'merged',
      mergedMemory: {
        content: parsed.content,
        title: parsed.title,
        summary: parsed.summary,
        keyPoints: parsed.keyPoints,
        tags: parsed.tags,
        confidence: parsed.confidence,
      },
      supersededIds: memories.map((m) => m.id),
      reason: `Supersede: ${parsed.reason}`,
    };
  }

  // auto strategy: LLM decides
  return {
    action: 'merged',
    mergedMemory: {
      content: parsed.content,
      title: parsed.title,
      summary: parsed.summary,
      keyPoints: parsed.keyPoints,
      tags: parsed.tags,
      confidence: Math.round(Math.max(0.1, Math.min(0.95, parsed.confidence)) * 100) / 100,
    },
    supersededIds: memories.map((m) => m.id),
    reason: parsed.reason,
  };
}
