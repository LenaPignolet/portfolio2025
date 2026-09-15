# Notion Webhooks & CI/CD Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Faire en sorte qu'un changement de projet dans Notion se répercute automatiquement sur le portfolio en production, sans rebuild manuel, et que la mise en prod se fasse via un workflow GitHub Actions plutôt que par transfert manuel de fichiers.

**Architecture:** Astro passe de `output: 'static'` à `output: 'server'` (adapter `@astrojs/node`, mode standalone), packagé en Docker. Un endpoint webhook reçoit les notifications Notion (signature HMAC vérifiée), rafraîchit un cache serveur en mémoire après un court debounce. Les images de projet sont résolues depuis une colonne Notion texte ("Images Names"), avec repli sur le mapping local existant. Le déploiement se fait via deux workflows GitHub Actions : CI (build check sur chaque push/PR) et CD (déclenchement manuel : build + push GHCR + déploiement SSH sur le VPS).

**Tech Stack:** Astro 5, Vue 3, `@astrojs/node`, Vitest, Docker, GitHub Actions, GitHub Container Registry (GHCR).

## Global Constraints

- Les images restent des fichiers locaux versionnés dans `public/images/projects/` — aucun téléchargement/upload automatique depuis Notion (cf. design doc, section Non-objectifs).
- Le cache client localStorage 24h dans `src/utils/notion.js` doit être supprimé (le cache serveur suffit).
- Le déclenchement du déploiement en production reste **manuel** (`workflow_dispatch`), jamais automatique sur push `main`.
- Les secrets applicatifs (clé Notion, secret webhook) vivent dans un `.env` **sur le VPS**, jamais dans les secrets GitHub Actions ni dans les logs CI.
- Toute nouvelle logique métier pure (parsing, cache, signature, debounce) doit être testée avec Vitest — pas de test pour la config/infra pure (Dockerfile, workflows YAML), qui se vérifie par exécution manuelle.
- Ce plan part de la branche `feature/notion-webhooks`, rebasée sur `develop` après le merge de `feature/notion-project-images`, `feature/app-desktop` et `fix/home-page` (2026-09-15). `develop` contient donc déjà `src/utils/logger.js`, `src/pages/api/projectImages.js`, `src/layouts/PortfolioApp.vue`, et `astro.config.mjs` avec `output: 'static'` — les tâches ci-dessous sont écrites contre cet état réel.

---

## Task 1: `resolveProjectImages` — parsing de la colonne Notion

**Files:**
- Create: `src/utils/resolveProjectImages.js`
- Create: `src/utils/resolveProjectImages.test.js`
- Modify: `package.json` (ajout de `vitest` en devDependency + script `test`)

**Interfaces:**
- Produces: `resolveProjectImages(imagesNamesText: string | undefined, fallbackImages?: string[]): string[]`

- [ ] **Step 1: Installer Vitest**

```bash
npm install -D vitest
```

- [ ] **Step 2: Ajouter le script de test dans `package.json`**

Dans `package.json`, dans le bloc `"scripts"`, ajouter :

```json
"test": "vitest run"
```

Le bloc `scripts` complet devient :

```json
"scripts": {
    "dev": "astro dev",
    "build": "astro build",
    "preview": "astro preview",
    "astro": "astro",
    "test": "vitest run"
}
```

- [ ] **Step 3: Écrire le test qui échoue**

Créer `src/utils/resolveProjectImages.test.js` :

```js
import { describe, expect, it } from 'vitest';
import { resolveProjectImages } from './resolveProjectImages.js';

describe('resolveProjectImages', () => {
    it('parses comma-separated file names into local image paths', () => {
        const result = resolveProjectImages('rolex_accessories.webp, rolex_accessories_2.webp');

        expect(result).toEqual([
            '/images/projects/rolex_accessories.webp',
            '/images/projects/rolex_accessories_2.webp',
        ]);
    });

    it('trims whitespace and ignores empty entries', () => {
        const result = resolveProjectImages(' foo.webp ,, bar.webp ,');

        expect(result).toEqual(['/images/projects/foo.webp', '/images/projects/bar.webp']);
    });

    it('deduplicates repeated file names', () => {
        const result = resolveProjectImages('foo.webp, foo.webp');

        expect(result).toEqual(['/images/projects/foo.webp']);
    });

    it('keeps an already-absolute path as-is', () => {
        const result = resolveProjectImages('/custom/path/foo.webp');

        expect(result).toEqual(['/custom/path/foo.webp']);
    });

    it('falls back to the provided images when the Notion column is empty', () => {
        const result = resolveProjectImages('', ['images/projects/legacy.webp']);

        expect(result).toEqual(['/images/projects/legacy.webp']);
    });

    it('falls back when the Notion column is undefined', () => {
        const result = resolveProjectImages(undefined, ['/images/projects/legacy.webp']);

        expect(result).toEqual(['/images/projects/legacy.webp']);
    });

    it('returns an empty array when both the column and the fallback are empty', () => {
        const result = resolveProjectImages('', []);

        expect(result).toEqual([]);
    });
});
```

- [ ] **Step 4: Lancer les tests et vérifier qu'ils échouent**

Run: `npm test -- resolveProjectImages`
Expected: FAIL — `Cannot find module './resolveProjectImages.js'`

- [ ] **Step 5: Implémenter `resolveProjectImages`**

Créer `src/utils/resolveProjectImages.js` :

```js
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
```

- [ ] **Step 6: Lancer les tests et vérifier qu'ils passent**

Run: `npm test -- resolveProjectImages`
Expected: PASS (7 tests)

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json src/utils/resolveProjectImages.js src/utils/resolveProjectImages.test.js
git commit -m "Add resolveProjectImages util with Vitest setup"
```

---

## Task 2: `debounce` — utilitaire de temporisation

**Files:**
- Create: `src/utils/debounce.js`
- Create: `src/utils/debounce.test.js`

**Interfaces:**
- Produces: `debounce(fn: (...args: any[]) => void, delayMs: number): ((...args: any[]) => void) & { cancel: () => void }`

- [ ] **Step 1: Écrire le test qui échoue**

Créer `src/utils/debounce.test.js` :

```js
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { debounce } from './debounce.js';

describe('debounce', () => {
    beforeEach(() => {
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('calls the function once after the delay when called once', () => {
        const fn = vi.fn();
        const debounced = debounce(fn, 1000);

        debounced();
        expect(fn).not.toHaveBeenCalled();

        vi.advanceTimersByTime(1000);
        expect(fn).toHaveBeenCalledTimes(1);
    });

    it('collapses multiple rapid calls into a single invocation', () => {
        const fn = vi.fn();
        const debounced = debounce(fn, 1000);

        debounced();
        vi.advanceTimersByTime(500);
        debounced();
        vi.advanceTimersByTime(500);
        expect(fn).not.toHaveBeenCalled();

        vi.advanceTimersByTime(500);
        expect(fn).toHaveBeenCalledTimes(1);
    });

    it('passes the arguments of the last call through', () => {
        const fn = vi.fn();
        const debounced = debounce(fn, 1000);

        debounced('first');
        debounced('second');

        vi.advanceTimersByTime(1000);
        expect(fn).toHaveBeenCalledWith('second');
    });

    it('cancel() prevents a pending call from firing', () => {
        const fn = vi.fn();
        const debounced = debounce(fn, 1000);

        debounced();
        debounced.cancel();

        vi.advanceTimersByTime(1000);
        expect(fn).not.toHaveBeenCalled();
    });
});
```

- [ ] **Step 2: Lancer les tests et vérifier qu'ils échouent**

Run: `npm test -- debounce`
Expected: FAIL — `Cannot find module './debounce.js'`

- [ ] **Step 3: Implémenter `debounce`**

Créer `src/utils/debounce.js` :

```js
export function debounce(fn, delayMs) {
    let timeoutId = null;

    function debounced(...args) {
        if (timeoutId) clearTimeout(timeoutId);
        timeoutId = setTimeout(() => {
            timeoutId = null;
            fn(...args);
        }, delayMs);
    }

    debounced.cancel = () => {
        if (timeoutId) {
            clearTimeout(timeoutId);
            timeoutId = null;
        }
    };

    return debounced;
}
```

- [ ] **Step 4: Lancer les tests et vérifier qu'ils passent**

Run: `npm test -- debounce`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add src/utils/debounce.js src/utils/debounce.test.js
git commit -m "Add debounce utility"
```

---

## Task 3: `projectsCache` — cache serveur en mémoire

**Files:**
- Create: `src/utils/projectsCache.js`
- Create: `src/utils/projectsCache.test.js`

**Interfaces:**
- Produces:
  - `getCachedProjects(): { projects: Array, updatedAt: number } | null`
  - `setCachedProjects(projects: Array): { projects: Array, updatedAt: number }`
  - `clearCachedProjects(): void`
  - `getOrRefreshProjects(fetchProjects: () => Promise<Array>): Promise<{ projects: Array, updatedAt: number }>`
  - `refreshProjectsCache(fetchProjects: () => Promise<Array>): Promise<{ projects: Array, updatedAt: number }>`

- [ ] **Step 1: Écrire le test qui échoue**

Créer `src/utils/projectsCache.test.js` :

```js
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
```

- [ ] **Step 2: Lancer les tests et vérifier qu'ils échouent**

Run: `npm test -- projectsCache`
Expected: FAIL — `Cannot find module './projectsCache.js'`

- [ ] **Step 3: Implémenter `projectsCache`**

Créer `src/utils/projectsCache.js` :

```js
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
```

- [ ] **Step 4: Lancer les tests et vérifier qu'ils passent**

Run: `npm test -- projectsCache`
Expected: PASS (7 tests)

- [ ] **Step 5: Commit**

```bash
git add src/utils/projectsCache.js src/utils/projectsCache.test.js
git commit -m "Add in-memory projects cache"
```

---

## Task 4: `notionWebhookSignature` — vérification HMAC

**Files:**
- Create: `src/utils/notionWebhookSignature.js`
- Create: `src/utils/notionWebhookSignature.test.js`

**Interfaces:**
- Produces:
  - `computeNotionSignature(rawBody: string, secret: string): string`
  - `verifyNotionSignature(rawBody: string, signatureHeader: string | null | undefined, secret: string | undefined): boolean`

**Note technique importante :** Notion signe le corps brut exact qu'il envoie (header `X-Notion-Signature`, format `sha256=<hex hmac-sha256>`, clé = le `verification_token` obtenu à la création de la souscription — voir [doc Notion](https://developers.notion.com/reference/webhooks)). On hash le texte brut de la requête tel que reçu, **sans** repasser par `JSON.parse` puis `JSON.stringify` : ce round-trip peut réordonner les clés et casser la comparaison de signature.

- [ ] **Step 1: Écrire le test qui échoue**

Créer `src/utils/notionWebhookSignature.test.js` :

```js
import { describe, expect, it } from 'vitest';
import { computeNotionSignature, verifyNotionSignature } from './notionWebhookSignature.js';

const SECRET = 'test-secret-not-a-real-notion-token';
const BODY = '{"verification_token":"test-secret-not-a-real-notion-token"}';

describe('computeNotionSignature', () => {
    it('produces a sha256= prefixed hex digest', () => {
        const signature = computeNotionSignature(BODY, SECRET);

        expect(signature).toMatch(/^sha256=[0-9a-f]{64}$/);
    });

    it('is deterministic for the same body and secret', () => {
        expect(computeNotionSignature(BODY, SECRET)).toBe(computeNotionSignature(BODY, SECRET));
    });
});

describe('verifyNotionSignature', () => {
    it('accepts a correctly signed payload', () => {
        const signature = computeNotionSignature(BODY, SECRET);

        expect(verifyNotionSignature(BODY, signature, SECRET)).toBe(true);
    });

    it('rejects a payload signed with the wrong secret', () => {
        const signature = computeNotionSignature(BODY, 'wrong-secret');

        expect(verifyNotionSignature(BODY, signature, SECRET)).toBe(false);
    });

    it('rejects a tampered body', () => {
        const signature = computeNotionSignature(BODY, SECRET);
        const tamperedBody = BODY.replace('secret_t', 'secret_x');

        expect(verifyNotionSignature(tamperedBody, signature, SECRET)).toBe(false);
    });

    it('rejects when the signature header is missing', () => {
        expect(verifyNotionSignature(BODY, null, SECRET)).toBe(false);
        expect(verifyNotionSignature(BODY, undefined, SECRET)).toBe(false);
    });

    it('rejects when the secret is missing', () => {
        const signature = computeNotionSignature(BODY, SECRET);

        expect(verifyNotionSignature(BODY, signature, undefined)).toBe(false);
    });

    it('rejects a malformed signature without throwing', () => {
        expect(verifyNotionSignature(BODY, 'not-a-valid-signature', SECRET)).toBe(false);
    });
});
```

- [ ] **Step 2: Lancer les tests et vérifier qu'ils échouent**

Run: `npm test -- notionWebhookSignature`
Expected: FAIL — `Cannot find module './notionWebhookSignature.js'`

- [ ] **Step 3: Implémenter `notionWebhookSignature`**

Créer `src/utils/notionWebhookSignature.js` :

```js
import { createHmac, timingSafeEqual } from 'node:crypto';

export function computeNotionSignature(rawBody, secret) {
    return `sha256=${createHmac('sha256', secret).update(rawBody).digest('hex')}`;
}

export function verifyNotionSignature(rawBody, signatureHeader, secret) {
    if (!signatureHeader || !secret) return false;

    const expected = computeNotionSignature(rawBody, secret);
    const expectedBuffer = Buffer.from(expected);
    const receivedBuffer = Buffer.from(signatureHeader);

    if (expectedBuffer.length !== receivedBuffer.length) return false;

    return timingSafeEqual(expectedBuffer, receivedBuffer);
}
```

- [ ] **Step 4: Lancer les tests et vérifier qu'ils passent**

Run: `npm test -- notionWebhookSignature`
Expected: PASS (8 tests)

- [ ] **Step 5: Commit**

```bash
git add src/utils/notionWebhookSignature.js src/utils/notionWebhookSignature.test.js
git commit -m "Add Notion webhook HMAC signature verification"
```

---

## Task 5: Passage en mode serveur (adapter Node)

**Files:**
- Modify: `astro.config.mjs`
- Modify: `src/pages/index.astro:1-6`
- Modify: `src/pages/app.astro:1-3`
- Modify: `package.json`

**Interfaces:**
- Aucune (changement de configuration/build, pas de nouvelle fonction JS).

- [ ] **Step 1: Installer l'adapter Node**

```bash
npm install @astrojs/node@latest
```

> Vérifié à l'exécution : `@astrojs/node@latest` (v11) exige `astro@^7.2.1`, incompatible avec `astro@^5.17.1` de ce projet. Utiliser plutôt la dernière version dont le peer dependency est satisfait par la version d'Astro installée (`npm view @astrojs/node@<version> peerDependencies` pour vérifier) — au moment de l'écriture, `@astrojs/node@9.5.3` (peer `astro@^5.14.3`).

- [ ] **Step 2: Mettre à jour `astro.config.mjs`**

Contenu actuel :

```js
// @ts-check
import { defineConfig } from 'astro/config';
import vue from "@astrojs/vue";
import svgr from "vite-plugin-svgr";

// https://astro.build/config
export default defineConfig({
  output: 'static',
  base: '/',
  vite: {
    plugins: [svgr()]
  },
  integrations: [vue()]
});
```

Remplacer par :

```js
// @ts-check
import { defineConfig } from 'astro/config';
import vue from "@astrojs/vue";
import svgr from "vite-plugin-svgr";
import node from "@astrojs/node";

// https://astro.build/config
export default defineConfig({
  output: 'server',
  adapter: node({ mode: 'standalone' }),
  base: '/',
  vite: {
    plugins: [svgr()]
  },
  integrations: [vue()]
});
```

- [ ] **Step 3: Marquer `src/pages/index.astro` comme prerendu**

Frontmatter actuel (lignes 1-6) :

```astro
---
import Layout from '../layouts/Layout.astro';
import { Github, Gitlab, Linkedin } from '@lucide/astro';
import Arrow from '../assets/icons/arrow-top-right.svg';
import Sparkle from '../assets/icons/sparkle.svg';
---
```

Ajouter `export const prerender = true;` en première ligne du frontmatter :

```astro
---
export const prerender = true;

import Layout from '../layouts/Layout.astro';
import { Github, Gitlab, Linkedin } from '@lucide/astro';
import Arrow from '../assets/icons/arrow-top-right.svg';
import Sparkle from '../assets/icons/sparkle.svg';
---
```

- [ ] **Step 4: Marquer `src/pages/app.astro` comme prerendu**

Frontmatter actuel :

```astro
---
import Layout from '../layouts/Layout.astro';
import PortfolioApp from '../layouts/PortfolioApp.vue';
---
<Layout>
  <PortfolioApp client:load />
</Layout>
```

Remplacer par :

```astro
---
export const prerender = true;

import Layout from '../layouts/Layout.astro';
import PortfolioApp from '../layouts/PortfolioApp.vue';
---
<Layout>
  <PortfolioApp client:load />
</Layout>
```

- [ ] **Step 5: Vérifier que le build fonctionne**

Run: `npm run build`
Expected: le build se termine sans erreur et produit un dossier `dist/server/` contenant `entry.mjs` (en plus de `dist/client/`).

- [ ] **Step 6: Vérifier que le serveur démarre et répond**

Run: `node ./dist/server/entry.mjs &` puis `sleep 1 && curl -s -o /dev/null -w "%{http_code}\n" http://localhost:4321/`
Expected: `200`

Puis arrêter le process : `kill %1`

- [ ] **Step 7: Commit**

```bash
git add astro.config.mjs src/pages/index.astro src/pages/app.astro package.json package-lock.json
git commit -m "Switch to server output with the Node adapter"
```

---

## Task 6: Dockerfile

**Files:**
- Create: `Dockerfile`
- Create: `.dockerignore`

**Interfaces:** Aucune.

- [ ] **Step 1: Créer `.dockerignore`**

```
node_modules
dist
.git
.env
.env.*
docs
*.md
```

- [ ] **Step 2: Créer le `Dockerfile`**

```dockerfile
# ---- Build stage ----
FROM node:22-alpine AS build
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build

# ---- Runtime stage ----
FROM node:22-alpine AS runtime
WORKDIR /app

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=4321

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY --from=build /app/dist ./dist

EXPOSE 4321
CMD ["node", "./dist/server/entry.mjs"]
```

> `npm ci --omit=dev` dans l'étage runtime est nécessaire : le renderer Vue d'Astro importe `vue` au runtime pour le SSR, pas seulement au build. Sans `node_modules` dans l'image finale, le conteneur crash au démarrage avec `ERR_MODULE_NOT_FOUND: Cannot find package 'vue'` (constaté en vérifiant l'étape suivante).

- [ ] **Step 3: Construire l'image et vérifier qu'elle démarre**

Run:

```bash
docker build -t portfolio:test .
docker run --rm -d -p 4321:4321 \
  -e VITE_NOTION_API_KEY=test \
  -e VITE_NOTION_DATABASE_ID=test \
  --name portfolio-test \
  portfolio:test
sleep 2
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:4321/
docker stop portfolio-test
```

Expected: le build réussit, et le `curl` final retourne `200` (la page d'accueil se rend même sans clé Notion valide, puisque le fetch Notion se fait côté client, pas au build ni au chargement de la page serveur).

- [ ] **Step 4: Commit**

```bash
git add Dockerfile .dockerignore
git commit -m "Add multi-stage Dockerfile for the server build"
```

---

## Task 7: docker-compose et variables d'environnement

**Files:**
- Create: `docker-compose.yml`
- Create: `.env.example`

**Interfaces:** Aucune.

- [ ] **Step 1: Créer `.env.example`**

```bash
# Notion
VITE_NOTION_API_KEY=
VITE_NOTION_DATABASE_ID=

# Notion webhook (voir Task 10 et Task 15)
# Valeur = le `verification_token` reçu lors de la création de la souscription webhook Notion.
NOTION_WEBHOOK_SECRET=

# Serveur (valeurs par défaut déjà fixées dans le Dockerfile, à ne surcharger que si besoin)
# HOST=0.0.0.0
# PORT=4321
```

- [ ] **Step 2: Créer `docker-compose.yml`**

```yaml
services:
  portfolio:
    image: ghcr.io/lenapignolet/portfolio2025:latest
    restart: unless-stopped
    ports:
      - "4321:4321"
    env_file:
      - .env
```

> Remplacer `lenapignolet/portfolio2025` si le nom du repo GitHub diffère — le nom d'image GHCR suit toujours `ghcr.io/<owner>/<repo>` en minuscules (cf. Task 13).

- [ ] **Step 3: Valider la syntaxe du compose file**

Run: `docker compose config`
Expected: affiche la configuration résolue sans erreur (le `.env` local du dev, avec les vraies clés Notion, doit exister au même endroit — c'est déjà le cas, cf. `.gitignore`).

- [ ] **Step 4: Commit**

```bash
git add docker-compose.yml .env.example
git commit -m "Add docker-compose config and .env.example"
```

---

## Task 8: `fetchNotionProjects` — extraction réutilisable du fetch + transform

**Files:**
- Create: `src/utils/fetchNotionProjects.js`
- Create: `src/utils/fetchNotionProjects.test.js`
- Read (sans modifier dans cette tâche) : `src/pages/api/projectImages.js`, `src/utils/logger.js`

**Interfaces:**
- Consumes: `resolveProjectImages(imagesNamesText, fallbackImages)` (Task 1), `projectImages` (objet exporté par `src/pages/api/projectImages.js`), `logger` (exporté par `src/utils/logger.js`)
- Produces:
  - `fetchNotionProjects(): Promise<Array<Project>>`
  - `transformProject(notionPage: object): Project`
  - où `Project = { id, title, context, works, description, date, skills: string[], filters: string[], url, images: string[] }`

- [ ] **Step 1: Écrire le test qui échoue**

Créer `src/utils/fetchNotionProjects.test.js` :

```js
import { describe, expect, it, vi } from 'vitest';

vi.mock('../pages/api/projectImages.js', () => ({
    projectImages: {
        'fallback-id': ['images/projects/legacy.webp'],
    },
}));

const { transformProject } = await import('./fetchNotionProjects.js');

function buildNotionPage(id, overrides = {}) {
    return {
        id,
        properties: {
            Name: { title: [{ plain_text: 'Mon projet' }] },
            Context: { rich_text: [{ plain_text: 'Contexte' }] },
            Works: { rich_text: [{ plain_text: 'Travaux' }] },
            Date: { date: { start: '2026-01-01' } },
            Skills: { multi_select: [{ name: 'Vue' }] },
            Filters: { multi_select: [{ name: 'E-commerce' }] },
            Url: { url: 'https://example.com' },
            ...overrides,
        },
    };
}

describe('transformProject', () => {
    it('uses the Images Names column when present', () => {
        const page = buildNotionPage('id-1', {
            'Images Names': { rich_text: [{ plain_text: 'foo.webp, bar.webp' }] },
        });

        const result = transformProject(page);

        expect(result.images).toEqual(['/images/projects/foo.webp', '/images/projects/bar.webp']);
    });

    it('falls back to the legacy mapping when the column is empty', () => {
        const page = buildNotionPage('fallback-id', {
            'Images Names': { rich_text: [] },
        });

        const result = transformProject(page);

        expect(result.images).toEqual(['/images/projects/legacy.webp']);
    });

    it('falls back to the legacy mapping when the column is absent entirely', () => {
        const page = buildNotionPage('fallback-id');

        const result = transformProject(page);

        expect(result.images).toEqual(['/images/projects/legacy.webp']);
    });

    it('returns no images when neither the column nor the fallback has any', () => {
        const page = buildNotionPage('unknown-id');

        const result = transformProject(page);

        expect(result.images).toEqual([]);
    });

    it('maps the remaining Notion properties', () => {
        const page = buildNotionPage('id-2');

        const result = transformProject(page);

        expect(result).toMatchObject({
            id: 'id-2',
            title: 'Mon projet',
            context: 'Contexte',
            works: 'Travaux',
            description: 'Contexte',
            date: '2026-01-01',
            skills: ['Vue'],
            filters: ['E-commerce'],
            url: 'https://example.com',
        });
    });

    it('falls back to default values when properties are missing', () => {
        const page = { id: 'id-3', properties: {} };

        const result = transformProject(page);

        expect(result).toMatchObject({
            id: 'id-3',
            title: 'Sans titre',
            context: '',
            works: '',
            date: '',
            skills: [],
            filters: [],
            url: '',
            images: [],
        });
    });
});
```

- [ ] **Step 2: Lancer les tests et vérifier qu'ils échouent**

Run: `npm test -- fetchNotionProjects`
Expected: FAIL — `Cannot find module './fetchNotionProjects.js'`

- [ ] **Step 3: Implémenter `fetchNotionProjects`**

Créer `src/utils/fetchNotionProjects.js` :

```js
import { logger } from './logger.js';
import { resolveProjectImages } from './resolveProjectImages.js';
import { projectImages } from '../pages/api/projectImages.js';

const NOTION_VERSION = '2022-06-28';

export async function fetchNotionProjects() {
    const apiKey = import.meta.env.VITE_NOTION_API_KEY;
    const databaseId = import.meta.env.VITE_NOTION_DATABASE_ID;
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
```

- [ ] **Step 4: Lancer les tests et vérifier qu'ils passent**

Run: `npm test -- fetchNotionProjects`
Expected: PASS (6 tests)

- [ ] **Step 5: Commit**

```bash
git add src/utils/fetchNotionProjects.js src/utils/fetchNotionProjects.test.js
git commit -m "Extract fetchNotionProjects with Images Names column support"
```

---

## Task 9: Brancher `api/projects.js` sur le cache et `fetchNotionProjects`

**Files:**
- Modify: `src/pages/api/projects.js` (remplacement intégral du fichier)

**Interfaces:**
- Consumes: `fetchNotionProjects()` (Task 8), `getOrRefreshProjects(fetchProjects)` (Task 3), `logger` (existant)

- [ ] **Step 1: Remplacer le contenu de `src/pages/api/projects.js`**

Contenu actuel (rappel, pour ne rien perdre lors du remplacement) :

```js
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
    // ... (fetch + transformProject, cf. Task 8 qui reprend cette logique)
}

function transformProject(project) {
    // ... (cf. Task 8)
}
```

Nouveau contenu complet :

```js
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
```

- [ ] **Step 2: Vérifier manuellement avec le serveur de dev**

Run: `npm run dev`, puis dans un autre terminal :

```bash
curl -s http://localhost:4321/api/projects | head -c 300
```

Expected: une réponse JSON `{"projects":[...],"logs":[...]}` (avec les vraies clés Notion configurées dans `.env`). Vérifier avec `curl` une seconde fois immédiatement après que la réponse est aussi rapide (servie depuis le cache mémoire, pas un nouvel appel Notion) — observable en ajoutant temporairement `console.log('fetch notion')` dans `fetchNotionProjects` si besoin, puis en le retirant.

- [ ] **Step 3: Commit**

```bash
git add src/pages/api/projects.js
git commit -m "Serve /api/projects from the in-memory projects cache"
```

---

## Task 10: Endpoint webhook Notion

**Files:**
- Create: `src/pages/api/webhooks/notion.js`
- Create: `src/pages/api/webhooks/notion.test.js`

**Interfaces:**
- Consumes: `verifyNotionSignature` (Task 4), `debounce` (Task 2), `refreshProjectsCache` (Task 3), `fetchNotionProjects` (Task 8), `logger` (existant)
- Produces: `POST({ request: Request }): Promise<Response>` (export Astro standard)

- [ ] **Step 1: Écrire le test qui échoue**

Créer `src/pages/api/webhooks/notion.test.js` :

```js
import { createHmac } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const SECRET = 'test-secret';
const ROUTE_PATH = './notion.js';

vi.mock('../../../utils/fetchNotionProjects.js', () => ({
    fetchNotionProjects: vi.fn().mockResolvedValue([]),
}));

vi.mock('../../../utils/projectsCache.js', () => ({
    refreshProjectsCache: vi.fn().mockResolvedValue({ projects: [], updatedAt: Date.now() }),
}));

function sign(body) {
    return `sha256=${createHmac('sha256', SECRET).update(body).digest('hex')}`;
}

function buildRequest(body, headers = {}) {
    return new Request('http://localhost/api/webhooks/notion', {
        method: 'POST',
        headers,
        body,
    });
}

describe('POST /api/webhooks/notion', () => {
    beforeEach(() => {
        vi.resetModules();
        vi.clearAllMocks();
        vi.useFakeTimers();
        vi.stubEnv('NOTION_WEBHOOK_SECRET', SECRET);
    });

    afterEach(() => {
        vi.useRealTimers();
        vi.unstubAllEnvs();
    });

    it('accepts the one-time verification handshake without a signature', async () => {
        const { POST } = await import(ROUTE_PATH);
        const body = JSON.stringify({ verification_token: 'secret_abc' });

        const response = await POST({ request: buildRequest(body) });

        expect(response.status).toBe(200);
    });

    it('rejects events with a missing or invalid signature', async () => {
        const { POST } = await import(ROUTE_PATH);
        const body = JSON.stringify({ type: 'page.properties_updated' });

        const response = await POST({
            request: buildRequest(body, { 'X-Notion-Signature': 'sha256=invalid' }),
        });

        expect(response.status).toBe(401);
    });

    it('rejects malformed JSON bodies before checking the signature', async () => {
        const { POST } = await import(ROUTE_PATH);

        const response = await POST({ request: buildRequest('not json') });

        expect(response.status).toBe(400);
    });

    it('accepts a correctly signed event and schedules a debounced cache refresh', async () => {
        const { POST } = await import(ROUTE_PATH);
        const { refreshProjectsCache } = await import('../../../utils/projectsCache.js');
        const body = JSON.stringify({ type: 'page.properties_updated' });

        const response = await POST({
            request: buildRequest(body, { 'X-Notion-Signature': sign(body) }),
        });

        expect(response.status).toBe(200);
        expect(refreshProjectsCache).not.toHaveBeenCalled();

        await vi.advanceTimersByTimeAsync(3000);

        expect(refreshProjectsCache).toHaveBeenCalledTimes(1);
    });

    it('collapses several signed events received within the debounce window into one refresh', async () => {
        const { POST } = await import(ROUTE_PATH);
        const { refreshProjectsCache } = await import('../../../utils/projectsCache.js');
        const body = JSON.stringify({ type: 'page.properties_updated' });
        const signedRequest = () => buildRequest(body, { 'X-Notion-Signature': sign(body) });

        await POST({ request: signedRequest() });
        await vi.advanceTimersByTimeAsync(1000);
        await POST({ request: signedRequest() });

        await vi.advanceTimersByTimeAsync(3000);

        expect(refreshProjectsCache).toHaveBeenCalledTimes(1);
    });
});
```

- [ ] **Step 2: Lancer les tests et vérifier qu'ils échouent**

Run: `npm test -- notion.test.js`
Expected: FAIL — `Cannot find module './notion.js'`

- [ ] **Step 3: Implémenter la route webhook**

Créer `src/pages/api/webhooks/notion.js` :

```js
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
        logger.info('webhook', 'verification_token reçu — à recopier dans Notion', {
            verification_token: payload.verification_token,
        });
        return new Response('OK', { status: 200 });
    }

    const secret = import.meta.env.NOTION_WEBHOOK_SECRET;
    const signatureHeader = request.headers.get('X-Notion-Signature');

    if (!verifyNotionSignature(rawBody, signatureHeader, secret)) {
        logger.warning('webhook', 'Signature invalide, requête rejetée');
        return new Response('Invalid signature', { status: 401 });
    }

    logger.info('webhook', 'Événement Notion reçu', { type: payload.type });
    scheduleRefresh();

    return new Response('OK', { status: 200 });
}
```

- [ ] **Step 4: Lancer les tests et vérifier qu'ils passent**

Run: `npm test -- notion.test.js`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add src/pages/api/webhooks/notion.js src/pages/api/webhooks/notion.test.js
git commit -m "Add Notion webhook endpoint with signature verification and debounce"
```

---

## Task 11: Suppression du cache client 24h

**Files:**
- Modify: `src/utils/notion.js` (remplacement intégral du fichier)

**Interfaces:**
- Produces (inchangé pour les appelants — mêmes noms, mêmes signatures) : `getProjects(): Promise<Array>`, `preloadProjects(): Promise<void>`, `clearProjectsCache(): void`

- [ ] **Step 1: Remplacer le contenu de `src/utils/notion.js`**

Nouveau contenu complet — le cache serveur (Task 3 + Task 9) rend le cache localStorage 24h contre-productif, il est supprimé. `clearProjectsCache` est conservée (no-op côté client) pour ne pas casser les appelants existants (appelée dans `onMounted` de `src/layouts/PortfolioApp.vue`, et importée — mais non utilisée — par `src/components/Projects.vue`) :

```js
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
```

- [ ] **Step 2: Vérifier manuellement dans le navigateur**

Run: `npm run dev`, ouvrir `/app` dans le navigateur, ouvrir les DevTools → Application → Local Storage.
Expected: aucune clé `portfolio_projects` n'apparaît après chargement de la page (le cache localStorage n'est plus utilisé). Les projets s'affichent normalement.

- [ ] **Step 3: Commit**

```bash
git add src/utils/notion.js
git commit -m "Remove client-side localStorage cache now that the server caches projects"
```

---

## Task 12: Workflow CI (build check)

**Files:**
- Create: `.github/workflows/ci.yml`

**Interfaces:** Aucune.

- [ ] **Step 1: Créer le workflow**

Créer `.github/workflows/ci.yml` :

```yaml
name: CI

on:
  push:
    branches-ignore:
      - main
  pull_request:

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Setup Node
        uses: actions/setup-node@v4
        with:
          node-version: '22'
          cache: 'npm'

      - name: Install dependencies
        run: npm ci

      - name: Run tests
        run: npm test

      - name: Build
        run: npm run build
        env:
          VITE_NOTION_API_KEY: dummy-key-for-build-check
          VITE_NOTION_DATABASE_ID: dummy-database-id
```

> `VITE_NOTION_API_KEY`/`VITE_NOTION_DATABASE_ID` factices : le build ne fait aucun appel Notion (le fetch se fait côté client au runtime), ces valeurs ne servent qu'à éviter un `undefined` si un import statique venait à les lire — filet de sécurité, pas une vraie dépendance au build actuel.

- [ ] **Step 2: Vérifier en poussant la branche**

Run: `git push` (la branche `feature/notion-webhooks` existe déjà côté remote, cf. conversation précédente)
Expected: dans l'onglet **Actions** du repo GitHub, le workflow **CI** se déclenche et passe au vert (tests + build).

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/ci.yml
git commit -m "Add CI workflow running tests and a build check"
```

---

## Task 13: Workflow CD (build image + push GHCR + déploiement SSH)

**Files:**
- Create: `.github/workflows/deploy.yml`

**Interfaces:** Aucune.

- [ ] **Step 1: Créer les secrets GitHub Actions nécessaires**

Dans GitHub → Settings → Secrets and variables → Actions → New repository secret, créer :

- `VPS_HOST` — l'adresse IP ou le nom de domaine du VPS
- `VPS_USER` — l'utilisateur SSH de déploiement
- `VPS_SSH_KEY` — la clé privée SSH dédiée au déploiement (voir Task 14 pour sa génération ; **ne pas réutiliser une clé personnelle**)
- `VPS_SSH_PORT` — le port SSH (`22` par défaut, à ajuster si le VPS utilise un port custom)

- [ ] **Step 2: Créer le workflow**

Créer `.github/workflows/deploy.yml` :

```yaml
name: Deploy

on:
  workflow_dispatch:
    inputs:
      ref:
        description: 'Branche ou tag à déployer'
        required: true
        default: 'main'

jobs:
  build-and-push:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      packages: write
    outputs:
      image: ${{ steps.image.outputs.image }}
    steps:
      - name: Checkout
        uses: actions/checkout@v4
        with:
          ref: ${{ inputs.ref }}

      - name: Log in to GHCR
        uses: docker/login-action@v3
        with:
          registry: ghcr.io
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}

      - name: Build and push image
        uses: docker/build-push-action@v6
        with:
          context: .
          push: true
          tags: |
            ghcr.io/${{ github.repository_owner }}/${{ github.event.repository.name }}:latest
            ghcr.io/${{ github.repository_owner }}/${{ github.event.repository.name }}:${{ github.sha }}

      - id: image
        run: echo "image=ghcr.io/${{ github.repository_owner }}/${{ github.event.repository.name }}:${{ github.sha }}" >> "$GITHUB_OUTPUT"

  deploy:
    needs: build-and-push
    runs-on: ubuntu-latest
    steps:
      - name: Deploy over SSH
        uses: appleboy/ssh-action@v1
        with:
          host: ${{ secrets.VPS_HOST }}
          username: ${{ secrets.VPS_USER }}
          key: ${{ secrets.VPS_SSH_KEY }}
          port: ${{ secrets.VPS_SSH_PORT }}
          script: |
            cd ~/portfolio
            docker compose pull
            docker compose up -d
            docker image prune -f
```

> `github.repository_owner`/`github.event.repository.name` génèrent automatiquement le nom d'image GHCR correct (minuscules requis par GHCR — GitHub les fournit déjà en minuscules pour un repo standard ; sinon les forcer en minuscules avec `${{ ... }} | tr ...` n'est pas nécessaire ici car `LenaPignolet/Portfolio2025` contient des majuscules : **vérifier à l'exécution** que l'image poussée est bien accessible sous un nom tout en minuscules, sinon fixer le nom d'image en dur dans le tag, ex. `ghcr.io/lenapignolet/portfolio2025`).

- [ ] **Step 3: Ajuster `docker-compose.yml` si le nom d'image en minuscules diffère**

Si l'étape précédente révèle que le nom d'image généré automatiquement ne correspond pas à celui utilisé dans `docker-compose.yml` (Task 7), aligner manuellement les deux (nom d'image en minuscules, cohérent entre le workflow et le compose file).

- [ ] **Step 4: Commit**

```bash
git add .github/workflows/deploy.yml
git commit -m "Add manual deploy workflow (build, push to GHCR, SSH deploy)"
```

---

## Task 14: Runbook — préparation initiale du VPS

**Files:**
- Create: `docs/deployment/vps-setup.md`

**Interfaces:** Aucune (documentation opérationnelle, pas de code).

- [ ] **Step 1: Rédiger le runbook**

Créer `docs/deployment/vps-setup.md` :

```markdown
# Préparation du VPS pour le déploiement Docker

Étapes à réaliser une seule fois, en SSH sur le VPS.

## 1. Installer Docker (si absent)

    curl -fsSL https://get.docker.com | sh
    sudo usermod -aG docker $USER
    # se reconnecter pour que le groupe docker prenne effet

Vérifier : `docker --version` et `docker compose version`.

## 2. Créer une clé SSH dédiée au déploiement

Depuis une machine de confiance (pas nécessairement le VPS) :

    ssh-keygen -t ed25519 -C "github-actions-deploy" -f ./deploy_key -N ""

- Ajouter le contenu de `deploy_key.pub` dans `~/.ssh/authorized_keys` sur le VPS.
- Ajouter le contenu de `deploy_key` (la clé privée) comme secret GitHub Actions `VPS_SSH_KEY` (cf. Task 13).
- Supprimer les fichiers `deploy_key` / `deploy_key.pub` de la machine locale une fois copiés.

## 3. Créer le répertoire de déploiement

    mkdir -p ~/portfolio
    cd ~/portfolio

## 4. Copier `docker-compose.yml` sur le VPS

Depuis la machine locale, à la racine du repo :

    scp docker-compose.yml <user>@<vps-host>:~/portfolio/docker-compose.yml

## 5. Créer le fichier `.env` sur le VPS

    cd ~/portfolio
    nano .env

Renseigner (voir `.env.example` dans le repo pour la liste à jour) :

    VITE_NOTION_API_KEY=<clé réelle>
    VITE_NOTION_DATABASE_ID=<id réel>
    NOTION_WEBHOOK_SECRET=

(`NOTION_WEBHOOK_SECRET` reste vide pour l'instant — il sera renseigné après le handshake de vérification Notion, cf. Task 15.)

## 6. Authentifier le VPS auprès de GHCR

Si le package GHCR est privé, le VPS doit s'authentifier pour pouvoir `pull` l'image. Créer un [Personal Access Token GitHub](https://github.com/settings/tokens) avec le scope `read:packages`, puis sur le VPS :

    echo <PAT> | docker login ghcr.io -u <github-username> --password-stdin

## 7. Premier déploiement manuel (avant le premier run du workflow CD)

    cd ~/portfolio
    docker compose pull
    docker compose up -d

Vérifier : `curl -s -o /dev/null -w "%{http_code}\n" http://localhost:4321/` doit retourner `200`.

## 8. Configurer nginx en reverse proxy

Ajouter (ou adapter) un server block nginx existant :

    server {
        listen 443 ssl;
        server_name <ton-domaine>;

        location / {
            proxy_pass http://127.0.0.1:4321;
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;
        }
    }

Puis :

    sudo nginx -t
    sudo systemctl reload nginx

Vérifier : `https://<ton-domaine>/` retourne bien la page d'accueil.
```

- [ ] **Step 2: Commit**

```bash
git add docs/deployment/vps-setup.md
git commit -m "Add VPS setup runbook for the Docker deployment"
```

---

## Task 15: Souscription webhook Notion + vérification end-to-end

**Files:**
- Create: `docs/deployment/notion-webhook-setup.md`

**Interfaces:** Aucune (documentation opérationnelle + vérification manuelle).

- [ ] **Step 1: Rédiger le runbook de création de la souscription**

Créer `docs/deployment/notion-webhook-setup.md` :

```markdown
# Créer la souscription webhook Notion

Prérequis : le site est déployé et accessible en HTTPS (cf. `vps-setup.md`), et `NOTION_WEBHOOK_SECRET` est vide dans le `.env` du VPS.

## 1. Créer la souscription

1. Aller sur la page de la connexion/intégration Notion utilisée pour ce projet ([notion.so/my-integrations](https://www.notion.so/my-integrations)).
2. Onglet **Webhooks** → **+ Create a subscription**.
3. URL du webhook : `https://<ton-domaine>/api/webhooks/notion`.
4. Sélectionner les types d'événements pertinents pour la base de données Projets : au minimum les événements de mise à jour de page/propriétés proposés dans la liste (ex. `page.properties_updated`, `page.content_updated`) — cocher aussi les événements de création/suppression de page si tu veux que l'ajout/suppression d'un projet se répercute aussi automatiquement.
5. Cliquer **Create subscription**.

## 2. Récupérer le verification_token

Notion envoie immédiatement une requête POST unique (non signée) à l'URL du webhook, avec `{"verification_token": "..."}`. Ce token doit apparaître dans les logs du conteneur :

    ssh <user>@<vps-host>
    cd ~/portfolio
    docker compose logs -f portfolio

Chercher la ligne loguée par `src/pages/api/webhooks/notion.js` (`verification_token reçu — à recopier dans Notion`).

> Si rien n'apparaît, cliquer **Resend token** dans la modale de vérification Notion.

## 3. Valider la souscription côté Notion

1. Retourner dans l'onglet **Webhooks** de la connexion Notion → cliquer **⚠️ Verify**.
2. Coller la valeur de `verification_token` récupérée dans les logs.
3. Cliquer **Verify subscription**.

## 4. Configurer le secret côté serveur

    ssh <user>@<vps-host>
    cd ~/portfolio
    nano .env
    # NOTION_WEBHOOK_SECRET=<le verification_token récupéré à l'étape 2>
    docker compose up -d

## 5. Vérification end-to-end

1. Ouvrir la base de données Projets dans Notion, choisir un projet existant.
2. Modifier la colonne "Images Names" (renseigner un nom de fichier présent dans `public/images/projects/`).
3. Attendre jusqu'à une minute (délai de livraison Notion, cf. leur documentation).
4. Vérifier dans les logs du conteneur qu'un événement a été reçu, signature validée, refresh déclenché :

       docker compose logs -f portfolio

5. Recharger `https://<ton-domaine>/app`, vérifier que les nouvelles images s'affichent — sans rebuild ni redéploiement manuel.
```

- [ ] **Step 2: Exécuter la vérification end-to-end décrite ci-dessus**

Suivre les étapes 1 à 5 du runbook avec un vrai projet Notion. Confirmer que le changement apparaît sur le site sans action manuelle autre que l'édition dans Notion.

- [ ] **Step 3: Commit**

```bash
git add docs/deployment/notion-webhook-setup.md
git commit -m "Add Notion webhook subscription runbook"
```
