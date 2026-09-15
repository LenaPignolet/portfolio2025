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

Copier la clé publique sur le VPS avec `ssh-copy-id` (plus fiable qu'un `cat >> ~/.ssh/authorized_keys` manuel — il crée `~/.ssh` avec les bonnes permissions si besoin) :

    ssh-copy-id -i deploy_key.pub <user>@<vps-host>

Vérifier que la connexion fonctionne avec cette clé précise avant d'aller plus loin :

    ssh -i deploy_key <user>@<vps-host> "echo connexion OK"

**Ordre important — ne pas supprimer les fichiers avant d'avoir fait les deux étapes suivantes dans cet ordre :**

1. Ajouter le contenu de `deploy_key` (la clé privée) comme secret GitHub Actions `VPS_SSH_KEY` : `gh secret set VPS_SSH_KEY < deploy_key`
2. Vérifier que le secret est bien créé : `gh secret list`
3. Seulement après confirmation, supprimer `deploy_key` / `deploy_key.pub` de la machine locale.

## 3. Créer le répertoire de déploiement

Ce projet réutilise le répertoire existant de l'ancien déploiement FileZilla :

    mkdir -p /var/www/portfolio2026
    cd /var/www/portfolio2026

(Les anciens fichiers statiques qui s'y trouvent peuvent être supprimés une fois le nouveau setup Docker validé.)

## 4. Copier `docker-compose.yml` sur le VPS

Depuis la machine locale, à la racine du repo :

    scp docker-compose.yml <user>@<vps-host>:/var/www/portfolio2026/docker-compose.yml

## 5. Créer le fichier `.env` sur le VPS

    cd /var/www/portfolio2026
    nano .env

Renseigner (voir `.env.example` dans le repo pour la liste à jour) :

    VITE_NOTION_API_KEY=<clé réelle>
    VITE_NOTION_DATABASE_ID=<id réel>
    NOTION_WEBHOOK_SECRET=

(`NOTION_WEBHOOK_SECRET` reste vide pour l'instant — il sera renseigné après le handshake de vérification Notion, voir `notion-webhook-setup.md`.)

## 6. Authentifier le VPS auprès de GHCR

Si le package GHCR est privé, le VPS doit s'authentifier pour pouvoir `pull` l'image. Créer un [Personal Access Token GitHub](https://github.com/settings/tokens) avec le scope `read:packages`, puis sur le VPS :

    echo <PAT> | docker login ghcr.io -u <github-username> --password-stdin

## 7. Premier déploiement manuel (avant le premier run du workflow CD)

    cd /var/www/portfolio2026
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
