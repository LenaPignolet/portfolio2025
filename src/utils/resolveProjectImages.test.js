import { describe, expect, it } from 'vitest';
import { resolveProjectImages } from './resolveProjectImages.js';

describe('resolveProjectImages', () => {
    it('parses comma-separated file names into local image paths', () => {
        const result = resolveProjectImages('rolex_accessories.webp, rolex_accessories_2.webp');

        expect(result).toEqual([
            '/images/projects/rolex_accessories.webp',
            '/images/projects/rolex_accessories_2.webp',
        ]);
    });

    it('trims whitespace and ignores empty entries', () => {
        const result = resolveProjectImages(' foo.webp ,, bar.webp ,');

        expect(result).toEqual(['/images/projects/foo.webp', '/images/projects/bar.webp']);
    });

    it('deduplicates repeated file names', () => {
        const result = resolveProjectImages('foo.webp, foo.webp');

        expect(result).toEqual(['/images/projects/foo.webp']);
    });

    it('keeps an already-absolute path as-is', () => {
        const result = resolveProjectImages('/custom/path/foo.webp');

        expect(result).toEqual(['/custom/path/foo.webp']);
    });

    it('falls back to the provided images when the Notion column is empty', () => {
        const result = resolveProjectImages('', ['images/projects/legacy.webp']);

        expect(result).toEqual(['/images/projects/legacy.webp']);
    });

    it('falls back when the Notion column is undefined', () => {
        const result = resolveProjectImages(undefined, ['/images/projects/legacy.webp']);

        expect(result).toEqual(['/images/projects/legacy.webp']);
    });

    it('returns an empty array when both the column and the fallback are empty', () => {
        const result = resolveProjectImages('', []);

        expect(result).toEqual([]);
    });
});
