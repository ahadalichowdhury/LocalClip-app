import { isClipboardNumbersCategory } from '../../src/shared/numeric-clipboard';

// Test utility functions for clipboard operations
describe('Clipboard Utilities', () => {
  describe('formatClipboardContent', () => {
    it('should truncate long text content', () => {
      const longText = 'a'.repeat(1000);
      const formatted = formatClipboardContent(longText, 100);
      expect(formatted).toHaveLength(103); // 100 + '...'
      expect(formatted.endsWith('...')).toBe(true);
    });

    it('should preserve short text content', () => {
      const shortText = 'Short text';
      const formatted = formatClipboardContent(shortText, 100);
      expect(formatted).toBe(shortText);
    });

    it('should handle empty content', () => {
      const formatted = formatClipboardContent('', 100);
      expect(formatted).toBe('');
    });
  });

  describe('detectContentType', () => {
    it('should detect URLs', () => {
      expect(detectContentType('https://example.com')).toBe('url');
      expect(detectContentType('http://test.org')).toBe('url');
      expect(detectContentType('ftp://files.example.com')).toBe('url');
    });

    it('should detect email addresses', () => {
      expect(detectContentType('user@example.com')).toBe('email');
      expect(detectContentType('test.email+tag@domain.co.uk')).toBe('email');
    });

    it('should detect numbers-only clipboard lines', () => {
      expect(detectContentType('+1-234-567-8900')).toBe('number');
      expect(detectContentType('(202) 555-1234')).toBe('number');
      expect(detectContentType('202-555-1234')).toBe('number');
      expect(detectContentType('4111 1111 1111 1111')).toBe('number');
    });

    it('should detect code snippets', () => {
      expect(detectContentType('function test() { return true; }')).toBe(
        'code'
      );
      expect(detectContentType('const x = 42;')).toBe('code');
      expect(detectContentType('<div>Hello World</div>')).toBe('code');
    });

    it('should default to text for unrecognized content', () => {
      expect(detectContentType('Just some regular text')).toBe('text');
      expect(detectContentType('Random words and numbers 123')).toBe('text');
    });
  });

  describe('categorizeContent', () => {
    it('should categorize URLs', () => {
      expect(categorizeContent('https://github.com/user/repo')).toBe('URLs');
      expect(categorizeContent('Visit https://example.com for more info')).toBe(
        'URLs'
      );
    });

    it('should categorize code', () => {
      expect(categorizeContent('npm install package-name')).toBe('Code');
      expect(categorizeContent('git commit -m "Initial commit"')).toBe('Code');
    });

    it('should categorize emails', () => {
      expect(categorizeContent('Contact us at support@example.com')).toBe(
        'Emails'
      );
    });

    it('should categorize numbers-only lines', () => {
      expect(categorizeContent('(202) 555-1234')).toBe('Numbers');
    });

    it('should default to Text category', () => {
      expect(categorizeContent('Just some regular text content')).toBe('Text');
    });
  });

  describe('isValidClipboardEntry', () => {
    it('should validate complete clipboard entries', () => {
      const validEntry = {
        id: 1,
        content: 'Test content',
        contentType: 'text',
        format: 'text' as const,
        preview: 'Test content',
        appName: 'TestApp',
        createdAt: new Date(),
        updatedAt: new Date(),
        isPinned: false,
        isFavorite: false,
        category: 'Text',
        tags: [],
        usageCount: 0,
      };

      expect(isValidClipboardEntry(validEntry)).toBe(true);
    });

    it('should reject entries with missing required fields', () => {
      const invalidEntry = {
        id: 1,
        content: 'Test content',
        // Missing other required fields
      };

      expect(isValidClipboardEntry(invalidEntry)).toBe(false);
    });

    it('should reject entries with invalid types', () => {
      const invalidEntry = {
        id: 'not-a-number', // Should be number
        content: 'Test content',
        contentType: 'text',
        format: 'text' as const,
        preview: 'Test content',
        appName: 'TestApp',
        createdAt: new Date(),
        updatedAt: new Date(),
        isPinned: false,
        isFavorite: false,
        category: 'Text',
        tags: [],
        usageCount: 0,
      };

      expect(isValidClipboardEntry(invalidEntry)).toBe(false);
    });
  });
});

// Utility functions (these would typically be in a separate file)
function formatClipboardContent(content: string, maxLength: number): string {
  if (content.length <= maxLength) {
    return content;
  }
  return content.substring(0, maxLength) + '...';
}

function detectContentType(content: string): string {
  // URL detection
  const urlRegex = /^(https?|ftp):\/\/[^\s/$.?#].[^\s]*$/i;
  if (urlRegex.test(content)) {
    return 'url';
  }

  // Email detection
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (emailRegex.test(content)) {
    return 'email';
  }

  if (isClipboardNumbersCategory(content)) {
    return 'number';
  }

  // Code detection (simplified)
  const codeKeywords = [
    'function',
    'const',
    'let',
    'var',
    'class',
    'import',
    'export',
    '<div>',
    '<span>',
    'npm',
    'git',
  ];
  if (codeKeywords.some(keyword => content.includes(keyword))) {
    return 'code';
  }

  return 'text';
}

function categorizeContent(content: string): string {
  // Check for URLs in text (more flexible than exact match)
  const urlRegex = /(https?|ftp):\/\/[^\s/$.?#].[^\s]*/i;
  if (urlRegex.test(content)) {
    return 'URLs';
  }

  // Check for emails in text
  const emailRegex = /[^\s@]+@[^\s@]+\.[^\s@]+/;
  if (emailRegex.test(content)) {
    return 'Emails';
  }

  if (isClipboardNumbersCategory(content.trim())) {
    return 'Numbers';
  }

  // Code detection (simplified)
  const codeKeywords = [
    'function',
    'const',
    'let',
    'var',
    'class',
    'import',
    'export',
    '<div>',
    '<span>',
    'npm',
    'git',
  ];
  if (codeKeywords.some(keyword => content.includes(keyword))) {
    return 'Code';
  }

  return 'Text';
}

function isValidClipboardEntry(entry: any): boolean {
  const requiredFields = [
    'id',
    'content',
    'contentType',
    'format',
    'createdAt',
    'updatedAt',
    'isPinned',
    'isFavorite',
    'category',
    'tags',
    'usageCount',
  ];

  // Check if all required fields exist
  for (const field of requiredFields) {
    if (!(field in entry)) {
      return false;
    }
  }

  // Check field types
  if (typeof entry.id !== 'number') return false;
  if (typeof entry.content !== 'string') return false;
  if (typeof entry.contentType !== 'string') return false;
  if (typeof entry.format !== 'string') return false;
  if (!(entry.createdAt instanceof Date)) return false;
  if (!(entry.updatedAt instanceof Date)) return false;
  if (typeof entry.isPinned !== 'boolean') return false;
  if (typeof entry.isFavorite !== 'boolean') return false;
  if (!Array.isArray(entry.tags)) return false;
  if (typeof entry.usageCount !== 'number') return false;

  return true;
}
