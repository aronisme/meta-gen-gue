import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock document.createElement and URL methods before importing
const mockClick = vi.fn();
const mockRevokeObjectURL = vi.fn();
const mockCreateObjectURL = vi.fn().mockReturnValue('blob:mock-url');

Object.defineProperty(global, 'document', {
  value: {
    createElement: vi.fn().mockReturnValue({
      click: mockClick,
      href: '',
      download: '',
    }),
  },
  writable: true,
});

Object.defineProperty(global, 'URL', {
  value: {
    createObjectURL: mockCreateObjectURL,
    revokeObjectURL: mockRevokeObjectURL,
  },
  writable: true,
});

Object.defineProperty(global, 'Blob', {
  value: class MockBlob {
    constructor(public parts: string[], public options: { type: string }) {}
  },
  writable: true,
});

// Import after mocks are set up
import { downloadAgencyCSV, generateAgencyCSV } from '../csv';
import type { ItemMetaBox } from '../types';

describe('CSV Exporters (2026 Microstock Compliance)', () => {
  const mockItems: ItemMetaBox[] = [
    {
      id: '1',
      filename: 'image1.jpg',
      fileType: 'photo',
      assetType: 'image',
      createdAt: Date.now(),
      meta: {
        title: 'Beautiful sunset, golden hour over the tropical sea and sand',
        description: 'A stunning sunset over the ocean with vibrant colors',
        keywords: 'sunset, ocean, sky, nature',
        category: '5',
        releases: 'model_release.jpg',
        shutterstockCategory: 'Nature',
        license: 'pro',
      },
    },
    {
      id: '2',
      filename: 'vector-art.eps',
      fileType: 'vector',
      assetType: 'image',
      createdAt: Date.now(),
      meta: {
        title: 'Geometric abstract background',
        description: 'Modern abstract geometric vector background',
        keywords: 'abstract, vector, background',
        category: '8',
        shutterstockCategory: 'Backgrounds/Textures',
        illustration: true,
        aiGenerated: true,
        aiPrompt: 'Geometric vector patterns with gold details',
        aiModel: 'Midjourney 6',
      },
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Adobe Stock CSV', () => {
    it('should generate Adobe CSV with correct headers and sanitized title', () => {
      const csv = generateAgencyCSV('adobe', mockItems);

      expect(csv).toContain('Filename,Title,Keywords,Category,Releases');
      expect(csv).toContain('"image1.jpg"');
      // Commas must be stripped from title
      expect(csv).not.toContain('sunset, golden hour');
      expect(csv).toContain('Beautiful sunset golden hour');
      expect(csv).toContain('"5"');
    });

    it('should truncate titles longer than 70 characters', () => {
      const longTitleItem: ItemMetaBox[] = [
        {
          id: 'long',
          filename: 'test.jpg',
          fileType: 'photo',
          assetType: 'image',
          createdAt: Date.now(),
          meta: {
            title:
              'This is a ridiculously long title that definitely exceeds the seventy character maximum limit allowed by Adobe Stock specifications',
            description: 'Long description',
            keywords: 'test',
          },
        },
      ];

      const csv = generateAgencyCSV('adobe', longTitleItem);
      // Header line + 1 row
      const lines = csv.split('\r\n');
      // Row is: "test.jpg","<sanitized_title>","test","",""
      const columns = lines[1].split('","');
      const title = columns[1].replace(/"/g, '');
      expect(title.length).toBeLessThanOrEqual(70);
    });
  });

  describe('Shutterstock CSV', () => {
    it('should generate Shutterstock CSV with 7 mandatory columns in correct order', () => {
      const csv = generateAgencyCSV('shutterstock', mockItems);

      expect(csv).toContain(
        'Filename,Description,Keywords,Categories,Illustration,Mature Content,Editorial'
      );
      // Row 1: photo
      expect(csv).toContain('"image1.jpg"');
      expect(csv).toContain('"Nature"');
      expect(csv).toContain('"No"'); // illustration = No for photo

      // Row 2: vector
      expect(csv).toContain('"vector-art.eps"');
      expect(csv).toContain('"Backgrounds/Textures"');
      expect(csv).toContain('"Yes"'); // illustration = Yes
    });
  });

  describe('Vecteezy CSV', () => {
    it('should include License column and respect license value', () => {
      const csv = generateAgencyCSV('vecteezy', mockItems);

      expect(csv).toContain('Filename,Title,Description,Keywords,License');
      expect(csv).toContain('"pro"');
    });

    it('should strip file extension when vecteezyFtpMode is enabled', () => {
      const csv = generateAgencyCSV('vecteezy', mockItems, { vecteezyFtpMode: true });

      expect(csv).toContain('"image1"');
      expect(csv).not.toContain('"image1.jpg"');
      expect(csv).toContain('"vector-art"');
      expect(csv).not.toContain('"vector-art.eps"');
    });

    it('should include Id column if items have vecteezyId', () => {
      const itemsWithId: ItemMetaBox[] = [
        {
          ...mockItems[0],
          meta: {
            ...mockItems[0].meta!,
            vecteezyId: 'VZ-998811',
          },
        },
      ];

      const csv = generateAgencyCSV('vecteezy', itemsWithId);
      expect(csv).toContain('Id,Filename,Title,Description,Keywords,License');
      expect(csv).toContain('"VZ-998811"');
    });
  });

  describe('Freepik / Magnific CSV', () => {
    it('should use semicolon as column delimiter and title case headers', () => {
      const csv = generateAgencyCSV('freepik', mockItems);

      // Delimiter is semicolon
      expect(csv).toContain('File name;Title;Keywords;Prompt;Model');
      // Keywords inside are comma-separated
      expect(csv).toContain('"sunset,ocean,sky,nature"');
    });

    it('should automatically append _ai_generated tag for AI generated assets', () => {
      const csv = generateAgencyCSV('freepik', mockItems);

      // Row 2 is aiGenerated = true
      expect(csv).toContain('_ai_generated');
      expect(csv).toContain('"Geometric vector patterns with gold details"');
      expect(csv).toContain('"Midjourney 6"');
    });
  });

  describe('Dreamstime CSV', () => {
    it('should generate Dreamstime CSV with correct format', () => {
      const csv = generateAgencyCSV('dreamstime', mockItems);

      expect(csv).toContain('Filename,Title,Description,Keywords');
      expect(csv).toContain('"image1.jpg"');
    });
  });

  describe('CSV Escaping and Browser Trigger', () => {
    it('should escape double quotes in values', () => {
      const itemsWithQuotes: ItemMetaBox[] = [
        {
          id: '1',
          filename: 'test.jpg',
          fileType: 'photo',
          assetType: 'image',
          createdAt: Date.now(),
          meta: {
            title: 'A "quoted" title',
            description: 'Description with "quotes"',
            keywords: 'test',
          },
        },
      ];

      const csv = generateAgencyCSV('adobe', itemsWithQuotes);
      expect(csv).toContain('""quoted""');
    });

    it('should trigger browser download with correct filename', () => {
      downloadAgencyCSV('adobe', mockItems);

      expect(mockCreateObjectURL).toHaveBeenCalled();
      expect(mockClick).toHaveBeenCalled();
      expect(mockRevokeObjectURL).toHaveBeenCalled();
    });

    it('should omit items that failed generation or have missing metadata', () => {
      const mixedItems: ItemMetaBox[] = [
        ...mockItems,
        {
          id: 'failed-1',
          filename: 'corrupted_or_failed.jpg',
          fileType: 'photo',
          assetType: 'image',
          createdAt: Date.now(),
          status: 'error',
          error: 'Model returned invalid JSON shape.',
        },
        {
          id: 'empty-1',
          filename: 'no_metadata.jpg',
          fileType: 'photo',
          assetType: 'image',
          createdAt: Date.now(),
        },
      ];

      const csv = generateAgencyCSV('adobe', mixedItems);
      expect(csv).toContain('image1.jpg');
      expect(csv).toContain('vector-art.eps');
      expect(csv).not.toContain('corrupted_or_failed.jpg');
      expect(csv).not.toContain('no_metadata.jpg');
    });

    it('should sanitize non-numeric Adobe categories to empty string to prevent rejection', () => {
      const itemsWithTextCategory: ItemMetaBox[] = [
        {
          id: 'text-cat',
          filename: 'photo.jpg',
          fileType: 'photo',
          assetType: 'image',
          createdAt: Date.now(),
          meta: {
            title: 'Sample Photo',
            description: 'Sample description',
            keywords: 'sample, photo',
            category: 'Technology', // invalid for Adobe, must be numeric 1-21
          },
        },
        {
          id: 'valid-num-cat',
          filename: 'valid.jpg',
          fileType: 'photo',
          assetType: 'image',
          createdAt: Date.now(),
          meta: {
            title: 'Valid Photo',
            description: 'Valid description',
            keywords: 'valid, photo',
            category: '19', // valid numeric
          },
        },
      ];

      const csv = generateAgencyCSV('adobe', itemsWithTextCategory);
      // Non-numeric should be emptied out ("")
      expect(csv).toContain('"photo.jpg","Sample Photo","sample, photo","",""');
      // Valid numeric should remain ("19")
      expect(csv).toContain('"valid.jpg","Valid Photo","valid, photo","19",""');
    });
  });
});

