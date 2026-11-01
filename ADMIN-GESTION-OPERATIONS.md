# Administration — installation des modules opérationnels

Cette version ajoute les écrans et API pour les livraisons, le stock, les dépenses, les indicateurs de rentabilité et les horaires/délais.

## Installation obligatoire après déploiement

1. Vérifier que le Worker Cloudflare est bien déployé avec `src/worker.js`, la liaison D1 nommée `DB` et les fichiers statiques servis par `ASSETS`.
2. Exécuter le fichier SQL **une seule fois** sur la base distante existante :
   ```sh
   npx wrangler d1 execute sparta-chicken-db --remote --file=./schema.sql
   ```
3. Configurer les secrets Cloudflare `ADMIN_USERNAME`, `ADMIN_PASSWORD_HASH` et `SESSION_SECRET`. Ne jamais mettre les mots de passe dans GitHub ou dans le navigateur.
4. Vérifier `/api/health`, puis ouvrir `/admin/` et se connecter.

## Fonctions disponibles

- Livraisons : création, livreur, adresse, frais facturés, coût du livreur, distance, statuts et total des gains nets sur les livraisons marquées « delivered ».
- Inventaire : articles, quantités, unités, seuils d'alerte et coût unitaire.
- Dépenses : saisie et historique.
- Rentabilité : ventes et dépenses du jour, gain net des livraisons, estimation avant coût matière.
- Horaires : ouverture/fermeture par jour, fermeture hebdomadaire, temps de préparation par défaut et délai de livraison minimum/maximum.

## Limites comptables importantes

Le profit affiché est une **estimation avant coût matière**. Pour obtenir un bénéfice net fiable, les coûts de recettes/ingrédients doivent être renseignés et reliés aux lignes de commande. Les frais de livraison sont comptabilisés séparément. Les chiffres sont calculés à partir des commandes et opérations effectivement enregistrées dans D1 ; aucune donnée fictive n'est créée.

Les réglages horaires et de préparation sont enregistrés dans D1, mais il faut encore les relier au parcours public de commande pour qu'ils imposent automatiquement des créneaux ou délais aux clients. Les modules commandes, réservations, clients, fidélité et promotions conservent leurs écrans en attente de raccordement fonctionnel.
