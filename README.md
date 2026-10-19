# By Sparta Chicken Sherbrooke — V2 Premium
Pages : `index.html` accueil, `menu.html` menu filtrable/recherche/panier démo, `reservation.html`, `fidelite.html`, `avis.html`, `contact.html` avec formulaire de livraison et calculateur nutritionnel illustratif. `styles.css` contient les styles responsive, animations de braises et animations au scroll. `app.js` gère les interactions de démonstration. `assets/sparta-hero-cinema.png` est le visuel cinématique généré.

## Déploiement
1. Décompressez ce ZIP.
2. Dans le dépôt EXISTANT `sparta-chicken-sherbrooke`, téléversez les fichiers du ZIP et remplacez les fichiers de même nom. Placez `index.html`, les autres pages, `styles.css`, `app.js` et `assets/` à la racine du dépôt.
3. Commit changes. Si le projet Cloudflare est connecté à ce dépôt, le déploiement se déclenche normalement automatiquement.
4. Ne modifiez pas `ma-boutique`.

## Limites production
Ceci est une base front-end avancée, pas encore une plateforme de commande 100 % opérationnelle. Stripe, comptes clients, vraie réservation, stock, commandes, fidélité, coupons, tableau d’administration, suivi GPS du livreur, envoi courriel/SMS et avis publiés nécessitent un backend sécurisé et des clés configurées côté serveur (Cloudflare Workers/Pages Functions + base de données). Ne jamais exposer de clé secrète Stripe dans le navigateur ou GitHub. Les valeurs nutritionnelles et prix sont des exemples à confirmer. Ne publiez pas une certification halal sans justificatif. Les traductions EN/ES doivent encore être intégrées. Les images des cartes sont chargées depuis Unsplash et nécessitent Internet. Le logo d’en-tête est un emblème typographique temporaire : remplacez-le par le fichier original du logo, sans le recréer par IA.
