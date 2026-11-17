# By Sparta Chicken Sherbrooke

Site du restaurant, menu dynamique et outils d’exploitation.

## Pages publiques
- `index.html` : page d’accueil principale.
- `menu.html` : produits publiés dans Cloudflare D1, filtres, panier et formulaire de commande.
- `reservation.html` : demande de réservation enregistrée dans D1, à confirmer par l’équipe.
- `contact.html`, `avis.html`, `fidelite.html` : pages d’information; les fonctions de soumission/compte ne doivent pas être considérées comme actives tant que leur backend dédié n’est pas livré.
- `accueil.html` : ancienne adresse redirigée vers `index.html`.

## Espaces privés
- `/admin/` : gestion propriétaire (commandes, produits, inventaire, dépenses, livraisons, paramètres).
- `/restaurant/` : traitement des commandes et consultation des demandes de réservation.
- `/livreur/` : livraisons disponibles, courses assignées et historique.

## Architecture
- Cloudflare Worker : `src/worker.js`
- Cloudflare D1 : binding `DB`, base `sparta-chicken-db`
- Fichiers publics : racine du dépôt
- Styles de l’accueil : `accueil.css`
- Styles des pages intérieures : `styles.css`
- Interactions publiques : `app.js`

## Commandes en ligne — phase 1
Les commandes utilisent les produits actifs de D1. Le serveur recalcule les prix et enregistre les commandes avec paiement `unpaid`. Les commandes de livraison créent une entrée de livraison non assignée. Stripe n’est pas inclus.

## Migrations D1
Les migrations incrémentales se trouvent dans `migrations/`. Vérifier l’état de la base distante avant d’appliquer une migration. Ne pas exécuter le fichier complet `schema.sql` sur une base existante : il sert de schéma initial et n’est pas un substitut aux migrations.

Ordre des migrations du projet :
1. `0002_staff_accounts.sql`
2. `0003_delivery_operations.sql`
3. `0004_order_checkout_details.sql`

Avant production, confirmer que les migrations requises sont appliquées sur D1, puis déployer le Worker.

## Vérifications
GitHub Actions vérifie la syntaxe JavaScript et l’application des migrations sur une base SQLite temporaire. Ces contrôles ne remplacent pas un test fonctionnel complet avec D1 et les trois espaces (client, restaurant, livreur).

## À terminer avant ouverture complète
- Vérifier les migrations sur la base D1 distante.
- Effectuer un test de commande réel de bout en bout avec des comptes de test.
- Renforcer la protection anti-abus du point d’entrée public de commande.
- Raccorder et tester les formulaires de réservation, contact et avis avant de les présenter comme des fonctions actives.
- Ajouter Stripe seulement après validation complète de la phase 1.
