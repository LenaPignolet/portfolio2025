import { logger } from '../../utils/logger.js';

/**
 * Mapping des IDs de projets vers leurs images locales
 * Les images doivent être dans public/images/projects/
 */
export const projectImages = {
    "309fbd55-76dc-808e-a19a-e693e1395ea1": [
        "/images/projects/rolex_accessories.webp",
        "/images/projects/rolex_accessories_2.webp",
        "/images/projects/rolex_accessories_3.webp",
    ],
    "309fbd55-76dc-8033-98d0-e7a6abe5139a": [
        "/images/projects/izipizi.webp",
        "/images/projects/izipizi_2.webp",
        "/images/projects/izipizi_3.webp"
    ],
    "309fbd55-76dc-8042-8cd8-eb82fda24045": [
        "images/projects/groupe_gif.webp", 
        "images/projects/groupe_gif_2.webp"
    ],
    "2eefbd55-76dc-8030-8d95-cc3b73dfa1c6": [
        "images/projects/cinq_mondes.webp",
        "images/projects/cinq_mondes_2.webp"
    ],
    "2effbd55-76dc-80a5-838f-e7fa93c5b62d": [
        "/images/projects/starbucks_at_home.webp",
        "/images/projects/starbucks_at_home_2.webp",
    ],
    "309fbd55-76dc-80bf-929f-e7a36882033f": [
        "images/projects/maison_richard.webp",
        "images/projects/maison_richard_2.webp"
    ],
    "309fbd55-76dc-80cd-9133-d539cfe876cd": [
        "/images/projects/packshot.webp",
        "/images/projects/packshot_2.webp",
    ],
    "309fbd55-76dc-8090-b523-ea5c558a22cb": [
        "/images/projects/atelier_photo.webp"
    ],
    "309fbd55-76dc-807e-8f0a-f3cd1cceac82": [
        "/images/projects/banniere_steam.webp"
    ],
    "309fbd55-76dc-80d0-b8f8-c34642f52397": [
        "/images/projects/recette.webp"
    ],
    "309fbd55-76dc-80f1-bb5e-fce9ed046571": [
        "/images/projects/strat_creative.webp"
    ]
};

logger.data('projectImages.js', 'Configuration chargée', Object.keys(projectImages));

export async function GET() {
    logger.debug('projectImages.js', 'GET endpoint appelé');
    return new Response(JSON.stringify({ 
        projectImages,
        logs: logger.getAllLogs() 
    }), {
        headers: { 'Content-Type': 'application/json' }
    });
}
