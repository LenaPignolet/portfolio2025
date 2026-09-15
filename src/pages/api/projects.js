import { fetchNotionProjects } from '../../utils/fetchNotionProjects.js';
import { getOrRefreshProjects } from '../../utils/projectsCache.js';
import { logger } from '../../utils/logger.js';

export async function GET() {
    try {
        const { projects } = await getOrRefreshProjects(fetchNotionProjects);

        return new Response(JSON.stringify({ projects, logs: logger.getAllLogs() }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
        });
    } catch (error) {
        logger.error('API Notion', 'Erreur serveur', error.message);
        return new Response(JSON.stringify({ error: error.message, logs: logger.getAllLogs() }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
        });
    }
}
