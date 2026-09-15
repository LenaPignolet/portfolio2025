let cache = null; // { projects: Array, updatedAt: number } | null
let pendingRefresh = null;

export function getCachedProjects() {
    return cache;
}

export function setCachedProjects(projects) {
    cache = { projects, updatedAt: Date.now() };
    return cache;
}

export function clearCachedProjects() {
    cache = null;
}

export async function getOrRefreshProjects(fetchProjects) {
    if (cache) return cache;
    return refreshProjectsCache(fetchProjects);
}

export async function refreshProjectsCache(fetchProjects) {
    if (!pendingRefresh) {
        pendingRefresh = fetchProjects()
            .then((projects) => {
                pendingRefresh = null;
                return setCachedProjects(projects);
            })
            .catch((error) => {
                pendingRefresh = null;
                throw error;
            });
    }
    return pendingRefresh;
}
