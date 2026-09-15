const IMAGES_BASE_PATH = '/images/projects/';

export function resolveProjectImages(imagesNamesText, fallbackImages = []) {
    const names = splitNames(imagesNamesText);

    if (names.length > 0) {
        return dedupe(names.map(toImagePath));
    }

    return dedupe(normalizeFallback(fallbackImages));
}

function splitNames(text) {
    return (text ?? '')
        .split(',')
        .map((name) => name.trim())
        .filter(Boolean);
}

function toImagePath(name) {
    return name.startsWith('/') ? name : `${IMAGES_BASE_PATH}${name}`;
}

function normalizeFallback(images) {
    return (images ?? [])
        .flat()
        .filter(Boolean)
        .map((path) => (path.startsWith('/') ? path : `/${path}`));
}

function dedupe(paths) {
    return Array.from(new Set(paths));
}
