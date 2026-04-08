/**
 * Tests for format pipeline function.
 */

import { describe, it, expect } from 'vitest';
import { detectType } from '../format.js';

describe('format', () => {
  describe('detectType', () => {
    it('should detect markdown with headers', () => {
      expect(detectType('# Hello World')).toBe('markdown');
    });

    it('should detect markdown with lists', () => {
      expect(detectType('- item 1\n- item 2')).toBe('markdown');
    });

    it('should detect markdown with bold', () => {
      expect(detectType('This is **bold** text')).toBe('markdown');
    });

    it('should detect markdown with links', () => {
      expect(detectType('[click here](https://example.com)')).toBe('markdown');
    });

    it('should detect markdown with code', () => {
      expect(detectType('Use `console.log`')).toBe('markdown');
    });

    it('should detect markdown with code blocks', () => {
      expect(detectType('```\ncode\n```')).toBe('markdown');
    });

    it('should detect markdown with ordered lists', () => {
      expect(detectType('1. First\n2. Second')).toBe('markdown');
    });

    it('should detect plain text', () => {
      expect(detectType('This is plain text without any formatting.')).toBe('text');
    });

    it('should detect plain text with newlines', () => {
      expect(detectType('Line one\nLine two\nLine three')).toBe('text');
    });
  });
});
