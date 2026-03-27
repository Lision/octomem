import 'dotenv/config';
import { Agent } from '@mariozechner/pi-agent-core';
import { getModel } from '@mariozechner/pi-ai';
import { FORMATTER_SYSTEM_PROMPT, buildFormatterPrompt } from './prompts.js';
import type { FormatterInput, FormatterOutput } from './types.js';

/**
 * Markdown detection patterns
 */
const MARKDOWN_PATTERNS = [
  /^#{1,6}\s/m,           // Headers
  /\[.+\]\(.+\)/,          // Links
  /^[-*+]\s/m,             // Unordered lists
  /^\d+\.\s/m,             // Ordered lists
  /^```/m,                 // Code blocks
  /\*\*.+\*\*/,            // Bold
  /`.+`/,                  // Inline code
];

/**
 * Formatter Agent - converts various input formats to structured markdown.
 *
 * Uses a small model (gpt-4o-mini) for cost efficiency.
 */
export class FormatterAgent {
  private agent: Agent;

  constructor() {
    this.agent = new Agent({
      initialState: {
        systemPrompt: FORMATTER_SYSTEM_PROMPT,
        model: getModel('openai', 'gpt-4o-mini'),
        tools: [],  // MVP doesn't need tools
        messages: [],
        thinkingLevel: 'off',  // Formatting doesn't need extended thinking
      },
    });
  }

  /**
   * Detect if content is markdown or plain text
   */
  detectType(content: string): 'text' | 'markdown' {
    const hasMarkdown = MARKDOWN_PATTERNS.some(pattern => pattern.test(content));
    return hasMarkdown ? 'markdown' : 'text';
  }

  /**
   * Format input content to structured markdown
   */
  async format(input: FormatterInput): Promise<FormatterOutput> {
    const type = input.type || this.detectType(input.content);
    const prompt = buildFormatterPrompt(input.content, type);

    let result = '';

    // Subscribe to streaming events
    this.agent.subscribe((event) => {
      if (
        event.type === 'message_update' &&
        event.assistantMessageEvent.type === 'text_delta'
      ) {
        result += event.assistantMessageEvent.delta;
      }
    });

    // Send prompt and wait for completion
    await this.agent.prompt(prompt);

    return {
      content: result,
      originalType: type,
      processedAt: new Date().toISOString(),
    };
  }

  /**
   * Reset agent state for a new formatting task
   */
  reset(): void {
    this.agent.reset();
  }
}
