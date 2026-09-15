// src/utils/notion.js
import { logger } from './logger.js';

const CACHE_KEY = 'portfolio_projects';
const CACHE_DURATION = 1000 * 60 * 60 * 24; // 24 heures

let fetchPromise = null;

function isCacheValid(cache) {
    if (!cache || !cache.timestamp || !cache.data) return false;
    return Date.now() - cache.timestamp < CACHE_DURATION;
}

function getFromCache() {
    try {
        const cached = localStorage.getItem(CACHE_KEY);
        if (!cached) {
            logger.debug('Cache', 'Pas de cache trouvé');
            return null;
        }

        const parsed = JSON.parse(cached);
        if (isCacheValid(parsed)) {
            logger.cache('Cache', 'Cache valide trouvé', `${parsed.data?.length ?? 0} projets`);
            return parsed.data;
        }

        logger.warning('Cache', 'Cache expiré, suppression');
        localStorage.removeItem(CACHE_KEY);
        return null;
    } catch (e) {
        logger.error('Cache', 'Cache corrompu', e.message);
        localStorage.removeItem(CACHE_KEY);
        return null;
    }
}

function saveToCache(projects) {
    try {
        localStorage.setItem(
            CACHE_KEY,
            JSON.stringify({
                timestamp: Date.now(),
                data: projects,
            }),
        );
        logger.success('Cache', 'Données sauvegardées en cache', `${projects?.length ?? 0} projets`);
    } catch (e) {
        logger.error('Cache', 'Erreur lors de la sauvegarde du cache', e.message);
    }
}

async function fetchFromAPI() {
    logger.loading('API', 'Appel à /api/projects');
    const response = await fetch('/api/projects');

    if (!response.ok) {
        const error = await response.json();
        logger.error('API', 'Réponse erreur', error.error);
        throw new Error(error.error || 'Erreur lors de la récupération');
    }

    const data = await response.json();
    
    // Récupère les logs du serveur
    if (data.logs) {
        logger.info('API', 'Logs serveur reçus', `${data.logs.length} entrées`);
        data.logs.forEach(log => {
            logger.log(log.type, log.module, log.message, log.data);
        });
    }
    
    logger.success('API', 'Données reçues', `${data.projects?.length ?? 0} projets`);
    return data.projects; // Les projets incluent déjà `localImages`
}

export async function getProjects() {
    const cachedProjects = getFromCache();
    if (cachedProjects) {
        return cachedProjects;
    }

    if (fetchPromise) {
        logger.debug('API', 'Requête déjà en cours, attente...');
        return fetchPromise;
    }

    fetchPromise = fetchFromAPI()
        .then((projects) => {
            saveToCache(projects);
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
    logger.warning('Cache', 'Effacement du cache');
    localStorage.removeItem(CACHE_KEY);
    fetchPromise = null;
}
