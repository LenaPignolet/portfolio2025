# Notion webhooks & CI/CD — design

## Problème

Le portfolio (Astro, `output: 'static'`) récupère les projets depuis Notion via
`src/pages/api/projects.js`. En mode static, cette route API est exécutée une
seule fois **au build** : son résultat est figé en JSON statique et ne change
plus jusqu'au prochain déploiement manuel. Il n'existe aujourd'hui aucun
mécanisme de mise à jour automatique des projets ou des images affichées.

Par ailleurs, les images de chaque projet sont actuellement résolues via un
mapping codé en dur (`src/pages/api/projectImages.js`, ID Notion → liste de
fichiers locaux), qui doit être édité manuellement à chaque changement.

Enfin, la mise en production se fait aujourd'hui manuellement via FileZilla
(drag & drop des fichiers buildés) — aucune automatisation, aucun historique
de déploiement, risque d'erreur humaine.

## Objectifs

- Un changement de projet dans Notion se répercute automatiquement sur le
  site, sans rebuild ni intervention manuelle.
- Les images restent des fichiers locaux versionnés dans le repo
  (`public/images/projects/`) — pas de gestion d'upload/téléchargement, pas de
  risque CORS ou d'URL Notion expirée.
- La liste des fichiers images par projet devient pilotée par une colonne
  Notion plutôt que par un mapping codé en dur, avec un filet de sécurité pour
  ne rien casser pendant la migration.
- Mettre en production se résume à déclencher un workflow GitHub Actions,
  sans FileZilla ni action manuelle sur le VPS.

## Non-objectifs

- Pas d'upload/téléchargement automatique de fichiers depuis Notion (évalué,
  écarté pour complexité — cf. échange en amont de ce document).
- Pas de rebuild complet du site déclenché par le webhook : seule la donnée
  projets est rafraîchie dynamiquement.
- Pas de déploiement automatique à chaque push sur `main` : le déclenchement
  reste manuel (choix explicite, cf. section CI/CD).

## Architecture

Passage de `output: 'static'` à `output: 'server'` (adapter `@astrojs/node`,
mode standalone), avec `index.astro` et `app.astro` explicitement marqués
`export const prerender = true` (aucune donnée n'y est fetchée côté serveur,
tout passe par le client). Les routes sous `src/pages/api/` restent
dynamiques (comportement par défaut en mode `server`).

Déploiement en Docker (choix de l'utilisateur, cohérent avec son usage
habituel) :

- Dockerfile multi-stage : build (`npm ci && npm run build`) puis runtime
  (`node:alpine`, `node ./dist/server/entry.mjs`).
- `docker-compose.yml` avec `restart: unless-stopped` pour la résilience
  (reboot VPS / crash), variables d'environnement injectées (clé API Notion,
  secret de signature webhook).
- nginx (déjà en place sur le VPS) fait un reverse proxy vers le conteneur.
  La configuration exacte sera vérifiée/ajustée à l'étape déploiement, l'accès
  VPS n'étant pas disponible depuis cette session — les commandes seront
  fournies à l'utilisateur à exécuter et le retour sera utilisé pour ajuster.

## Données projets — colonne images

La colonne Notion existante "Images Names" (texte) devient la source de
vérité : une chaîne de noms de fichiers séparés par des virgules, ex.
`rolex_accessories.webp, rolex_accessories_2.webp`.

`transformProject()` dans `src/pages/api/projects.js` :

1. Lit `props['Images Names']?.rich_text` (propriété texte Notion).
2. Découpe sur `,`, trim, filtre les vides, préfixe par `/images/projects/`.
3. Si la colonne est vide pour un projet, fallback sur le mapping existant
   `projectImages.js` (rien ne casse pendant la migration progressive des
   projets vers la colonne Notion).

## Webhook

Nouvelle route `POST /api/webhooks/notion.js` :

- **Vérification de la souscription** : au moment de la création de la
  souscription webhook côté Notion, un challenge de vérification est envoyé
  une fois ; il doit être récupéré (logs serveur) et recopié dans l'interface
  Notion dans le délai imparti.
- **Sécurité** : chaque requête entrante est vérifiée via la signature HMAC
  fournie par Notion (header `X-Notion-Signature`, calculée avec le secret
  obtenu à la vérification). Toute requête non signée correctement est
  rejetée (401) avant tout traitement.
- **Traitement** : sur un événement validé concernant la base de données
  projets, déclenche un refetch Notion et met à jour un cache serveur en
  mémoire (`{ projects, updatedAt }`).
- **Debounce** : un court délai (~2-3s) après le dernier événement reçu avant
  de déclencher le refetch, pour absorber les rafales d'événements quand
  plusieurs propriétés sont modifiées à la suite sur un même projet, et
  limiter les appels à l'API Notion.

## Cache

- **Serveur** : cache en mémoire dans le process Node, peuplé au démarrage
  (premier appel) et rafraîchi par le webhook. `GET /api/projects` sert ce
  cache directement.
- **Client** : suppression complète du cache localStorage 24h actuellement
  dans `src/utils/notion.js`. Il devient contre-productif : il masquerait les
  mises à jour pourtant déjà disponibles côté serveur. Le cache serveur
  répond assez vite pour ne pas nécessiter de cache client.

## CI/CD

Le repo est sur GitHub ; l'utilisatrice a un accès SSH au VPS (en plus de
FileZilla). Deux workflows GitHub Actions distincts :

**CI** (`.github/workflows/ci.yml`) — déclenché sur chaque push/PR :
`npm ci && npm run build`. Garde-fou uniquement, aucun impact sur la prod.

**CD** (`.github/workflows/deploy.yml`) — déclenché **manuellement**
(`workflow_dispatch`, bouton "Run workflow" dans l'onglet Actions, avec choix
de la branche/du ref à déployer). Étapes :

1. Build de l'image Docker et push vers GitHub Container Registry (GHCR) —
   pas de service tiers à gérer, déjà lié au compte GitHub, tag sur le SHA du
   commit + `latest`.
2. Connexion SSH au VPS (clé de déploiement stockée en secret GitHub Actions)
   et exécution de `docker compose pull && docker compose up -d`.

**Répartition des secrets** :

- Dans **GitHub Actions secrets** : uniquement ce qui est nécessaire pour se
  connecter et déclencher le déploiement (host/utilisateur VPS, clé SSH de
  déploiement).
- Dans un **`.env` sur le VPS** (jamais transmis par CI) : clé API Notion,
  ID de base de données, secret de signature webhook. Lu directement par
  `docker-compose.yml` au démarrage du conteneur. Évite que ces secrets
  transitent dans les logs GitHub Actions à chaque déploiement.

Le déclenchement manuel (plutôt qu'auto sur push `main`) est un choix
délibéré : la mise en prod reste une action volontaire et contrôlée, tout en
supprimant l'étape FileZilla.

## Risques / points de vigilance

- Nécessite un accès administrateur du workspace Notion pour créer la
  souscription webhook (à confirmer avant la mise en place).
- Le webhook Notion exige une URL HTTPS publique joignable : impossible de
  tester la livraison réelle en local sans tunnel (ex. ngrok) ou déploiement
  VPS anticipé.
- Le passage en mode `server` change le comportement de build/déploiement
  (nécessite un process qui tourne en continu, contrairement au static pur
  actuel) — impact sur toute la chaîne de déploiement, pas seulement sur les
  projets.
- Le VPS doit pouvoir s'authentifier auprès de GHCR pour faire le `docker
  compose pull` (`docker login ghcr.io`, à faire une fois manuellement lors
  du déploiement initial) si le package Docker est privé.
- La clé SSH de déploiement stockée dans les secrets GitHub Actions doit être
  dédiée (pas la clé personnelle de l'utilisatrice) et restreinte aux
  actions nécessaires sur le VPS.
