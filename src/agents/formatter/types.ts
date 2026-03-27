/**
 * Input type for the Formatter Agent
 */
export interface FormatterInput {
  /** Content to format */
  content: string;
  /** Optional type hint ('text' or 'markdown') */
  type?: 'text' | 'markdown';
  /** Optional source identifier */
  source?: string;
}

/**
 * Output from the Formatter Agent
 */
export interface FormatterOutput {
  /** Formatted markdown content */
  content: string;
  /** Detected or provided input type */
  originalType: string;
  /** ISO timestamp of when processing completed */
  processedAt: string;
}
