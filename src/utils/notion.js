// src/utils/notion.js
import { logger } from './logger.js';

let fetchPromise = null;

async function fetchFromAPI() {
    logger.loading('API', 'Appel à /api/projects');
    const response = await fetch('/api/projects');

    if (!response.ok) {
        const error = await response.json();
        logger.error('API', 'Réponse erreur', error.error);
        throw new Error(error.error || 'Erreur lors de la récupération');
    }

    const data = await response.json();

    if (data.logs) {
        logger.info('API', 'Logs serveur reçus', `${data.logs.length} entrées`);
        data.logs.forEach((log) => {
            logger.log(log.type, log.module, log.message, log.data);
        });
    }

    logger.success('API', 'Données reçues', `${data.projects?.length ?? 0} projets`);
    return data.projects;
}

export async function getProjects() {
    if (fetchPromise) {
        logger.debug('API', 'Requête déjà en cours, attente...');
        return fetchPromise;
    }

    fetchPromise = fetchFromAPI()
        .then((projects) => {
            fetchPromise = null;
            return projects;
        })
        .catch((error) => {
            logger.error('getProjects', 'Erreur', error.message);
            fetchPromise = null;
            throw error;
        });

    return fetchPromise;
}

export async function preloadProjects() {
    try {
        logger.loading('preloadProjects', 'Préchargement des projets...');
        await getProjects();
        logger.success('preloadProjects', 'Préchargement terminé');
    } catch (err) {
        logger.error('preloadProjects', 'Erreur de préchargement', err.message);
    }
}

export function clearProjectsCache() {
    fetchPromise = null;
}
