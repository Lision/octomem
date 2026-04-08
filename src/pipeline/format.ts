/**
 * format() — converts input content to clean markdown.
 *
 * If content is already markdown, returns it as-is (no LLM call).
 * Otherwise, uses LLM to convert plain text to structured markdown.
 */

import { completeSimple } from '@mariozechner/pi-ai';
import type { Model } from '@mariozechner/pi-ai';
import { FORMAT_SYSTEM_PROMPT, buildFormatPrompt } from './prompts.js';
import type { FormatInput, FormatOutput } from './types.js';

/** Markdown detection patterns */
const MARKDOWN_PATTERNS = [
  /^#{1,6}\s/m,           // Headers
  /\[.+\]\(.+\)/,          // Links
  /^[-*+]\s/m,             // Unordered lists
  /^\d+\.\s/m,             // Ordered lists
  /^```/m,                 // Code blocks
  /\*\*.+\*\*/,            // Bold
  /`.+`/,                  // Inline code
];

/** Detect if content is markdown or plain text */
export function detectType(content: string): 'text' | 'markdown' {
  const hasMarkdown = MARKDOWN_PATTERNS.some((pattern) => pattern.test(content));
  return hasMarkdown ? 'markdown' : 'text';
}

/** Extract text content from an AssistantMessage */
function extractText(content: Array<{ type: string; text?: string }>): string {
  return content
    .filter((c) => c.type === 'text' && c.text)
    .map((c) => c.text!)
    .join('');
}

/** Format input content to clean markdown */
export async function format(input: FormatInput, model: Model<'openai-completions'>): Promise<FormatOutput> {
  const type = input.type === 'auto' || !input.type
    ? detectType(input.content)
    : input.type;

  // Already markdown — skip LLM
  if (type === 'markdown') {
    return { content: input.content, detectedType: 'markdown' };
  }

  // Plain text — use LLM to format
  const prompt = buildFormatPrompt(input.content, 'text');
  const result = await completeSimple(model, {
    systemPrompt: FORMAT_SYSTEM_PROMPT,
    messages: [{ role: 'user', content: prompt, timestamp: Date.now() }],
  });

  return {
    content: extractText(result.content as Array<{ type: string; text?: string }>),
    detectedType: 'text',
  };
}
