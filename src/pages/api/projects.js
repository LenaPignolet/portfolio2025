import { projectImages } from './projectImages.js';
import { logger } from '../../utils/logger.js';

logger.success('projects.js', 'Import projectImages réussi', {
    'IDs configurés': Object.keys(projectImages),
    'Détail config': Object.entries(projectImages).map(([id, images]) => ({
        id,
        'Nombre images': images.length,
        'Images': images,
    })),
});

const apiKey = import.meta.env.VITE_NOTION_API_KEY;
const databaseId = import.meta.env.VITE_NOTION_DATABASE_ID;

export async function GET() {
    const url = `https://api.notion.com/v1/databases/${databaseId}/query`;

    try {
        logger.loading('API Notion', 'Appel à l\'API Notion...');
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${apiKey}`,
                'Notion-Version': '2022-06-28',
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                sorts: [
                    {
                        property: 'Date',
                        direction: 'descending',
                    },
                ],
            }),
        });

        if (!response.ok) {
            const error = await response.json();
            logger.error('API Notion', 'Erreur lors de l\'appel', error.message);
            return new Response(JSON.stringify({ error: error.message, logs: logger.getAllLogs() }), {
                status: response.status,
                headers: { 'Content-Type': 'application/json' },
            });
        }

        const data = await response.json();
        logger.success('API Notion', `${data.results.length} projets reçus`);
        
        const projects = data.results.map(transformProject);
        
        logger.data('API Notion', 'Projets transformés', projects.map(p => ({
            id: p.id,
            title: p.title,
            images: p.images?.length ?? 0,
        })));

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

function transformProject(project) {
    const props = project.properties ?? {};
    const projectTitle = props.Name?.title?.[0]?.plain_text ?? 'Sans titre';

    // Récupère les images depuis la configuration locale et normalise
    let images = projectImages[project.id] ?? [];
    if (!Array.isArray(images)) images = [images];
    // flatten in case of nested arrays, remove falsy, ensure leading slash, dedupe
    images = images.flat().filter(Boolean).map((p) => (p.startsWith('/') ? p : `/${p}`));
    images = Array.from(new Set(images));

    const hasImagesInConfig = project.id in projectImages;

    // Log détaillé pour debugging
    logger.debug('transformProject', `${projectTitle}`, {
        'ID Notion': project.id,
        'Dans config': hasImagesInConfig,
        'Nombre images': images.length,
        'Images': images,
    });

    if (!hasImagesInConfig && Object.keys(projectImages).length > 0) {
        logger.warning('transformProject', `⚠️ ID "${project.id}" non trouvé en config pour "${projectTitle}"`, {
            'IDs config disponibles': Object.keys(projectImages),
        });
    }

    return {
        id: project.id,
        title: projectTitle,
        context: props.Context?.rich_text?.[0]?.plain_text ?? '',
        works: props.Works?.rich_text?.[0]?.plain_text ?? '',
        description: props.Context?.rich_text?.[0]?.plain_text ?? '',
        date: props.Date?.date?.start ?? '',
        skills: props.Skills?.multi_select?.map((s) => s.name) ?? [],
        filters: props.Filters?.multi_select?.map((f) => f.name) ?? [],
        url: props.Url?.url ?? '',
        images: images,
    };
}
