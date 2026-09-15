import { describe, expect, it, vi } from 'vitest';

vi.mock('../pages/api/projectImages.js', () => ({
    projectImages: {
        'fallback-id': ['images/projects/legacy.webp'],
    },
}));

const { transformProject } = await import('./fetchNotionProjects.js');

function buildNotionPage(id, overrides = {}) {
    return {
        id,
        properties: {
            Name: { title: [{ plain_text: 'Mon projet' }] },
            Context: { rich_text: [{ plain_text: 'Contexte' }] },
            Works: { rich_text: [{ plain_text: 'Travaux' }] },
            Date: { date: { start: '2026-01-01' } },
            Skills: { multi_select: [{ name: 'Vue' }] },
            Filters: { multi_select: [{ name: 'E-commerce' }] },
            Url: { url: 'https://example.com' },
            ...overrides,
        },
    };
}

describe('transformProject', () => {
    it('uses the Images Names column when present', () => {
        const page = buildNotionPage('id-1', {
            'Images Names': { rich_text: [{ plain_text: 'foo.webp, bar.webp' }] },
        });

        const result = transformProject(page);

        expect(result.images).toEqual(['/images/projects/foo.webp', '/images/projects/bar.webp']);
    });

    it('falls back to the legacy mapping when the column is empty', () => {
        const page = buildNotionPage('fallback-id', {
            'Images Names': { rich_text: [] },
        });

        const result = transformProject(page);

        expect(result.images).toEqual(['/images/projects/legacy.webp']);
    });

    it('falls back to the legacy mapping when the column is absent entirely', () => {
        const page = buildNotionPage('fallback-id');

        const result = transformProject(page);

        expect(result.images).toEqual(['/images/projects/legacy.webp']);
    });

    it('returns no images when neither the column nor the fallback has any', () => {
        const page = buildNotionPage('unknown-id');

        const result = transformProject(page);

        expect(result.images).toEqual([]);
    });

    it('maps the remaining Notion properties', () => {
        const page = buildNotionPage('id-2');

        const result = transformProject(page);

        expect(result).toMatchObject({
            id: 'id-2',
            title: 'Mon projet',
            context: 'Contexte',
            works: 'Travaux',
            description: 'Contexte',
            date: '2026-01-01',
            skills: ['Vue'],
            filters: ['E-commerce'],
            url: 'https://example.com',
        });
    });

    it('falls back to default values when properties are missing', () => {
        const page = { id: 'id-3', properties: {} };

        const result = transformProject(page);

        expect(result).toMatchObject({
            id: 'id-3',
            title: 'Sans titre',
            context: '',
            works: '',
            date: '',
            skills: [],
            filters: [],
            url: '',
            images: [],
        });
    });
});
