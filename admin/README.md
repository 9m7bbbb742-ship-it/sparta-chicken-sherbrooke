# Administration By Sparta Chicken

Première interface responsive de l'espace administrateur.

## État actuel
- Interface privée prévue sous le chemin `/admin/`.
- Navigation visuelle entre les modules.
- Aucun faux chiffre ni fausse commande n'est affiché.
- Les modules ne sont pas encore connectés à une API ou à une base de données.
- **Cette version ne fournit pas encore d'authentification. Ne pas considérer le chemin /admin comme protégé.**

## Étapes backend avant mise en production
1. Confirmer le mode de déploiement Cloudflare (Workers ou Pages).
2. Créer un Cloudflare Worker API et une base D1.
3. Ajouter une authentification propriétaire robuste (sessions côté serveur, cookies HttpOnly/Secure/SameSite, limitation de tentatives, hachage des mots de passe).
4. Protéger chaque route API par autorisation côté serveur; ne jamais compter sur le masquage de l'interface.
5. Ajouter les schémas D1 et les opérations CRUD, puis connecter chaque module.
6. Configurer les secrets uniquement dans Cloudflare, jamais dans Git.
7. Tester sauvegardes, paiements, taxes et flux de commande avant activation publique.

## Déploiement
Le dépôt ne contient actuellement aucun fichier de configuration Cloudflare évident (`wrangler.toml` ou `wrangler.jsonc`). Déterminer si le site est servi par Workers ou Pages dans le tableau de bord Cloudflare avant de choisir la configuration de déploiement.
