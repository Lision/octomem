/**
 * validate() — core differentiator: checks consistency with existing memories.
 *
 * Finds similar memories via vector search, then uses LLM to classify each
 * as CONTRADICTS | OVERLAPS | INDEPENDENT. Computes initial confidence for
 * the new content.
 */

import { completeSimple } from '@mariozechner/pi-ai';
import type { Model } from '@mariozechner/pi-ai';
import { VALIDATE_SYSTEM_PROMPT, buildValidatePrompt } from './prompts.js';
import type { ValidateInput, ValidateOutput, ContradictionResult, OverlapResult } from './types.js';
import type { MemoryStore } from '../core/storage/store.js';
import type { Memory } from '../core/storage/types.js';

/** Extract text content from an AssistantMessage */
function extractText(content: Array<{ type: string; text?: string }>): string {
  return content
    .filter((c) => c.type === 'text' && c.text)
    .map((c) => c.text!)
    .join('');
}

interface LlmJudgment {
  existingMemoryId: string;
  relationship: 'CONTRADICTS' | 'OVERLAPS' | 'INDEPENDENT';
  confidence: number;
  reasoning: string;
  conflictingPoints?: string[];
  severity?: 'high' | 'medium' | 'low';
  overlappingTopics?: string[];
  overlapScore?: number;
}

interface LlmValidateResponse {
  judgments: LlmJudgment[];
}

/** Parse JSON from LLM response */
function parseJsonResponse(text: string): LlmValidateResponse {
  let cleaned = text.trim();
  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
  }
  return JSON.parse(cleaned);
}

/** Validate new content against existing memories for consistency */
export async function validate(
  input: ValidateInput,
  store: MemoryStore,
  model: Model<'openai-completions'>,
): Promise<ValidateOutput> {
  // Find candidate similar memories
  const queryText = input.summary || input.content;
  const similar = await store.findSimilarMemories(queryText, {
    topK: 5,
    minSimilarity: 0.6,
  });

  // No candidates — skip LLM, pass through
  if (similar.length === 0) {
    return {
      valid: true,
      contradictions: [],
      overlaps: [],
      confidence: 0.8,
      recommendations: [],
    };
  }

  // Build context for LLM
  const existingMemories = similar.map((s) => ({
    id: s.memory.id,
    summary: s.memory.summary ?? s.memory.content.slice(0, 200),
    content: s.memory.content,
  }));

  const prompt = buildValidatePrompt(
    input.content,
    input.summary,
    input.keyPoints,
    existingMemories,
  );

  const result = await completeSimple(model, {
    systemPrompt: VALIDATE_SYSTEM_PROMPT,
    messages: [{ role: 'user', content: prompt, timestamp: Date.now() }],
  });

  const text = extractText(result.content as Array<{ type: string; text?: string }>);
  const parsed = parseJsonResponse(text);

  // Process judgments
  const contradictions: ContradictionResult[] = [];
  const overlaps: OverlapResult[] = [];
  const recommendations: string[] = [];

  for (const judgment of parsed.judgments) {
    if (judgment.relationship === 'CONTRADICTS') {
      const mem = similar.find((s) => s.memory.id === judgment.existingMemoryId);
      contradictions.push({
        existingMemoryId: judgment.existingMemoryId,
        existingSummary: judgment.reasoning,
        conflictingPoints: judgment.conflictingPoints ?? [],
        severity: judgment.severity ?? 'medium',
      });
      recommendations.push(
        `Conflict with memory ${judgment.existingMemoryId}: ${judgment.reasoning}`,
      );
    } else if (judgment.relationship === 'OVERLAPS') {
      overlaps.push({
        existingMemoryId: judgment.existingMemoryId,
        existingSummary: judgment.reasoning,
        overlapScore: judgment.overlapScore ?? 0.7,
        overlappingTopics: judgment.overlappingTopics ?? [],
      });
    }
  }

  // Confidence is unaffected by contradictions — penalty is applied on conflict resolution
  let confidence = 0.8;
  if (contradictions.length === 0 && overlaps.length > 0) {
    confidence += 0.05;
  }
  confidence = Math.round(Math.max(0.1, Math.min(0.95, confidence)) * 100) / 100;

  return {
    valid: contradictions.length === 0,
    contradictions,
    overlaps,
    confidence,
    recommendations,
  };
}
