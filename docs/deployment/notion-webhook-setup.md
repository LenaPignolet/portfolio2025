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

## 5. Mettre à jour les projets dans Notion

Renommer/ajouter, sur la base de données Projets, une colonne texte **"Images Names"** contenant les noms de fichiers séparés par des virgules (ex. `rolex_accessories.webp, rolex_accessories_2.webp`), correspondant à des fichiers déjà présents dans `public/images/projects/` du repo. Tant que cette colonne est vide pour un projet, le mapping existant dans `src/pages/api/projectImages.js` continue de servir de repli.

## 6. Vérification end-to-end

1. Ouvrir la base de données Projets dans Notion, choisir un projet existant.
2. Modifier la colonne "Images Names" (renseigner un nom de fichier présent dans `public/images/projects/`).
3. Attendre jusqu'à une minute (délai de livraison Notion).
4. Vérifier dans les logs du conteneur qu'un événement a été reçu, signature validée, refresh déclenché :

       docker compose logs -f portfolio

5. Recharger `https://<ton-domaine>/app`, vérifier que les nouvelles images s'affichent — sans rebuild ni redéploiement manuel.
