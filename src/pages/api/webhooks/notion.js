import { verifyNotionSignature } from '../../../utils/notionWebhookSignature.js';
import { refreshProjectsCache } from '../../../utils/projectsCache.js';
import { fetchNotionProjects } from '../../../utils/fetchNotionProjects.js';
import { debounce } from '../../../utils/debounce.js';
import { logger } from '../../../utils/logger.js';

const DEBOUNCE_DELAY_MS = 3000;

const scheduleRefresh = debounce(() => {
    refreshProjectsCache(fetchNotionProjects).catch((error) => {
        logger.error('webhook', 'Échec du refresh après webhook', error.message);
    });
}, DEBOUNCE_DELAY_MS);

export async function POST({ request }) {
    const rawBody = await request.text();

    let payload;
    try {
        payload = JSON.parse(rawBody);
    } catch {
        return new Response('Invalid JSON', { status: 400 });
    }

    // Handshake initial : Notion envoie ce payload une seule fois, non signé,
    // lors de la création de la souscription. Le token doit être recopié
    // manuellement dans l'interface Notion, puis stocké dans NOTION_WEBHOOK_SECRET
    // sur le serveur (cf. Task 15).
    if (payload.verification_token) {
        // console.log direct (pas logger.info) : logger.enabled vaut false par défaut,
        // ce qui masquerait ce message critique dans `docker compose logs`.
        console.log(`[webhook] verification_token reçu — à recopier dans Notion : ${payload.verification_token}`);
        return new Response('OK', { status: 200 });
    }

    // process.env, pas import.meta.env : doit être lu au runtime du conteneur (cf. fetchNotionProjects.js)
    const secret = process.env.NOTION_WEBHOOK_SECRET;
    const signatureHeader = request.headers.get('X-Notion-Signature');

    if (!verifyNotionSignature(rawBody, signatureHeader, secret)) {
        logger.warning('webhook', 'Signature invalide, requête rejetée');
        return new Response('Invalid signature', { status: 401 });
    }

    logger.info('webhook', 'Événement Notion reçu', { type: payload.type });
    scheduleRefresh();

    return new Response('OK', { status: 200 });
}
