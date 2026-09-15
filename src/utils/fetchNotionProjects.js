import { logger } from './logger.js';
import { resolveProjectImages } from './resolveProjectImages.js';
import { projectImages } from '../pages/api/projectImages.js';

const NOTION_VERSION = '2022-06-28';

export async function fetchNotionProjects() {
    // process.env (not import.meta.env) — ces valeurs doivent être lues au runtime
    // du conteneur, pas figées au build (le build Docker tourne sans les vraies
    // variables, .env est exclu via .dockerignore).
    const apiKey = process.env.VITE_NOTION_API_KEY;
    const databaseId = process.env.VITE_NOTION_DATABASE_ID;
    const url = `https://api.notion.com/v1/databases/${databaseId}/query`;

    logger.loading('API Notion', "Appel à l'API Notion...");

    const response = await fetch(url, {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${apiKey}`,
            'Notion-Version': NOTION_VERSION,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            sorts: [{ property: 'Date', direction: 'descending' }],
        }),
    });

    if (!response.ok) {
        const error = await response.json();
        logger.error('API Notion', "Erreur lors de l'appel", error.message);
        throw new Error(error.message);
    }

    const data = await response.json();
    logger.success('API Notion', `${data.results.length} projets reçus`);

    const projects = data.results.map(transformProject);

    logger.data(
        'API Notion',
        'Projets transformés',
        projects.map((project) => ({
            id: project.id,
            title: project.title,
            images: project.images?.length ?? 0,
        })),
    );

    return projects;
}

export function transformProject(project) {
    const props = project.properties ?? {};
    const projectTitle = props.Name?.title?.[0]?.plain_text ?? 'Sans titre';

    const imagesNamesText = props['Images Names']?.rich_text?.[0]?.plain_text ?? '';
    const fallbackImages = projectImages[project.id] ?? [];
    const images = resolveProjectImages(imagesNamesText, fallbackImages);

    logger.debug('transformProject', projectTitle, {
        'ID Notion': project.id,
        'Colonne Images Names': imagesNamesText,
        'Nombre images': images.length,
        Images: images,
    });

    if (images.length === 0) {
        logger.warning('transformProject', `⚠️ Aucune image pour "${projectTitle}"`, {
            'ID Notion': project.id,
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
        images,
    };
}
