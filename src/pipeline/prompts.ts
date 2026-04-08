/**
 * LLM prompt templates for all pipeline functions.
 *
 * Each prompt is designed for a specific pipeline stage.
 * Output format instructions are explicit to reduce parsing errors.
 */

// ─── format() ───

export const FORMAT_SYSTEM_PROMPT = `You are a memory formatter for the Octomem system.

Your job is to convert input content into clean, well-structured markdown format.

Rules:
1. Preserve ALL meaningful information from the input
2. Use appropriate markdown formatting:
   - Headers for sections
   - Lists for enumerated items
   - Code blocks for code or technical content
   - Bold/italic for emphasis where appropriate
3. Do NOT add information that doesn't exist in the original
4. Keep the language of the original content
5. If the input is already well-formatted markdown, preserve its structure
6. Output ONLY the formatted markdown, no explanations or meta-comments`;

export function buildFormatPrompt(content: string, type: string): string {
  return `Format the following ${type} content into clean, well-structured markdown:

---
${content}
---`;
}

// ─── structurize() ───

export const STRUCTURIZE_SYSTEM_PROMPT = `You are a memory structurizer for the Octomem system.

Your job is to extract structured information from markdown content.

Output a JSON object with exactly these fields:
{
  "title": "A concise title (5-10 words) capturing the main topic",
  "summary": "1-3 sentences summarizing the core content",
  "keyPoints": ["Fact or insight 1", "Fact or insight 2", ...],
  "tags": ["category/subcategory", ...]
}

Rules:
1. Extract only facts and insights present in the content — do NOT invent information
2. Each keyPoint should be a specific, concrete fact or observation
3. Tags should be lowercase, use a/b format for hierarchical categories (e.g., "typescript/generics", "rust/ownership")
4. Keep the language of the original content for title, summary, and keyPoints
5. Tags should be in English
6. Output ONLY the JSON object, no other text`;

export function buildStructurizePrompt(content: string, hints?: { title?: string; tags?: string[] }): string {
  let prompt = `Analyze the following markdown content and extract structured information:

---
${content}
---`;

  if (hints?.title) {
    prompt += `\n\nSuggested title (use if appropriate): ${hints.title}`;
  }
  if (hints?.tags && hints.tags.length > 0) {
    prompt += `\n\nSuggested tags (include these as candidates): ${hints.tags.join(', ')}`;
  }

  return prompt;
}

// ─── validate() ───

export const VALIDATE_SYSTEM_PROMPT = `You are a memory consistency validator for the Octomem system.

Your job is to detect contradictions and overlaps between a new memory and existing memories.

For each existing memory, classify the relationship as exactly one of:
- CONTRADICTS: The memories contain conflicting factual claims
- OVERLAPS: The memories cover the same topic but are complementary or redundant
- INDEPENDENT: The memories are unrelated or cover different topics

Output a JSON object:
{
  "judgments": [
    {
      "existingMemoryId": "...",
      "relationship": "CONTRADICTS" | "OVERLAPS" | "INDEPENDENT",
      "confidence": 0.0-1.0,
      "reasoning": "Brief explanation",
      "conflictingPoints": ["specific conflicting fact"],  // only for CONTRADICTS
      "severity": "high" | "medium" | "low",               // only for CONTRADICTS
      "overlappingTopics": ["topic1", "topic2"],            // only for OVERLAPS
      "overlapScore": 0.0-1.0                               // only for OVERLAPS
    }
  ]
}

Rules:
1. Be precise — only flag genuine contradictions, not merely different perspectives on the same topic
2. "high" severity = direct factual conflict (e.g., "X is 5" vs "X is 10")
3. "medium" severity = different interpretation or angle
4. "low" severity = minor detail differences
5. Output ONLY the JSON object`;

export function buildValidatePrompt(
  newContent: string,
  newSummary: string,
  newKeyPoints: string[],
  existingMemories: Array<{ id: string; summary: string; content: string }>,
): string {
  let prompt = `New memory to validate:

Summary: ${newSummary}
Key Points:
${newKeyPoints.map((p) => `- ${p}`).join('\n')}

Full content:
---
${newContent}
---

Existing memories to compare against:`;

  for (const mem of existingMemories) {
    prompt += `

--- Memory ${mem.id} ---
Summary: ${mem.summary}
Content:
${mem.content}
---`;
  }

  prompt += '\n\nFor each existing memory, determine if the new memory CONTRADICTS, OVERLAPS, or is INDEPENDENT.';
  return prompt;
}

// ─── merge() ───

export const MERGE_SYSTEM_PROMPT = `You are a memory merger for the Octomem system.

Your job is to merge overlapping memories into a single, comprehensive memory.

Rules:
1. Preserve ALL factual information from all memories — lose nothing
2. Remove only true duplication (identical or near-identical statements)
3. Organize the merged content logically with clear headers
4. Resolve minor contradictions by preserving both viewpoints with context
5. For major contradictions, note the conflict explicitly
6. Output clean markdown
7. Keep the language of the original memories

Output a JSON object:
{
  "content": "merged markdown content",
  "title": "merged title",
  "summary": "merged summary (1-3 sentences)",
  "keyPoints": ["merged key point 1", ...],
  "tags": ["merged/tag1", ...],
  "confidence": 0.0-0.95,
  "reason": "explanation of merge decisions"
}`;

export function buildMergePrompt(
  memories: Array<{ id: string; content: string; summary?: string }>,
  newContent?: string,
): string {
  let prompt = 'Merge the following overlapping memories into one comprehensive memory:\n';

  for (const mem of memories) {
    prompt += `\n--- Memory ${mem.id} ---\n${mem.content}\n`;
    if (mem.summary) {
      prompt += `Summary: ${mem.summary}\n`;
    }
  }

  if (newContent) {
    prompt += `\n--- New Content ---\n${newContent}\n`;
  }

  prompt += '\nProduce a single merged memory that preserves all facts.';
  return prompt;
}

// ─── resolveConflict() (future: LLM-assisted) ───

export const CONFLICT_SYSTEM_PROMPT = `You are a conflict resolver for the Octomem system.

Your job is to resolve contradictions between memories by determining which is more accurate.

Rules:
1. Use logical reasoning to determine which memory is more likely correct
2. Consider specificity, recency indicators, and internal consistency
3. If both memories have valid points, suggest a merged version that reconciles them
4. Never simply discard factual information — preserve or reconcile

Output a JSON object:
{
  "winnerId": "id of the more accurate memory, or null if merge is needed",
  "resolution": "explanation of the decision",
  "mergedContent": "merged content if reconciliation is possible, null otherwise",
  "confidence": 0.0-0.95
}`;

export function buildConflictPrompt(
  memories: Array<{ id: string; content: string; summary?: string }>,
  hint?: string,
): string {
  let prompt = 'Resolve the contradiction between these memories:\n';

  for (const mem of memories) {
    prompt += `\n--- Memory ${mem.id} ---\n${mem.content}\n`;
    if (mem.summary) {
      prompt += `Summary: ${mem.summary}\n`;
    }
  }

  if (hint) {
    prompt += `\nUser hint: ${hint}`;
  }

  return prompt;
}
