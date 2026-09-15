import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
    clearCachedProjects,
    getCachedProjects,
    getOrRefreshProjects,
    refreshProjectsCache,
    setCachedProjects,
} from './projectsCache.js';

describe('projectsCache', () => {
    beforeEach(() => {
        clearCachedProjects();
    });

    it('returns null when nothing has been cached yet', () => {
        expect(getCachedProjects()).toBeNull();
    });

    it('setCachedProjects stores the projects with a timestamp', () => {
        const result = setCachedProjects([{ id: '1' }]);

        expect(result.projects).toEqual([{ id: '1' }]);
        expect(typeof result.updatedAt).toBe('number');
        expect(getCachedProjects()).toEqual(result);
    });

    it('getOrRefreshProjects fetches and caches when the cache is empty', async () => {
        const fetchProjects = vi.fn().mockResolvedValue([{ id: '1' }]);

        const result = await getOrRefreshProjects(fetchProjects);

        expect(fetchProjects).toHaveBeenCalledTimes(1);
        expect(result.projects).toEqual([{ id: '1' }]);
        expect(getCachedProjects()).toEqual(result);
    });

    it('getOrRefreshProjects does not refetch when the cache is already populated', async () => {
        setCachedProjects([{ id: 'cached' }]);
        const fetchProjects = vi.fn().mockResolvedValue([{ id: 'fresh' }]);

        const result = await getOrRefreshProjects(fetchProjects);

        expect(fetchProjects).not.toHaveBeenCalled();
        expect(result.projects).toEqual([{ id: 'cached' }]);
    });

    it('refreshProjectsCache always refetches, even when the cache is populated', async () => {
        setCachedProjects([{ id: 'cached' }]);
        const fetchProjects = vi.fn().mockResolvedValue([{ id: 'fresh' }]);

        const result = await refreshProjectsCache(fetchProjects);

        expect(fetchProjects).toHaveBeenCalledTimes(1);
        expect(result.projects).toEqual([{ id: 'fresh' }]);
        expect(getCachedProjects().projects).toEqual([{ id: 'fresh' }]);
    });

    it('deduplicates concurrent refreshProjectsCache calls into a single fetch', async () => {
        let resolveFetch;
        const fetchProjects = vi.fn(
            () =>
                new Promise((resolve) => {
                    resolveFetch = resolve;
                }),
        );

        const call1 = refreshProjectsCache(fetchProjects);
        const call2 = refreshProjectsCache(fetchProjects);

        resolveFetch([{ id: 'shared' }]);
        const [result1, result2] = await Promise.all([call1, call2]);

        expect(fetchProjects).toHaveBeenCalledTimes(1);
        expect(result1).toEqual(result2);
    });

    it('clearCachedProjects resets the cache so the next call refetches', async () => {
        setCachedProjects([{ id: 'cached' }]);
        clearCachedProjects();

        const fetchProjects = vi.fn().mockResolvedValue([{ id: 'fresh' }]);
        await getOrRefreshProjects(fetchProjects);

        expect(fetchProjects).toHaveBeenCalledTimes(1);
    });
});
