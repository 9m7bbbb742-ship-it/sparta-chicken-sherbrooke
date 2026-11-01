# Mise en service sécurisée — Sparta Chicken Sherbrooke

Cette branche prépare un Worker API et le schéma D1. Elle ne doit pas être considérée comme une boutique de commande complète ni être fusionnée en production avant les vérifications ci-dessous.

## Configuration Cloudflare

1. Le Worker doit utiliser la configuration Wrangler de ce dépôt (fichier `wrangler.jsonc`), avec `main: src/worker.js`, les assets statiques et le binding D1 nommé `DB`.
2. Exécuter une seule fois le schéma sur la base D1 `sparta-chicken-db` : `wrangler d1 execute sparta-chicken-db --remote --file=./schema.sql`.
3. Ajouter dans les secrets/variables du Worker :
   - `ADMIN_USERNAME` : `Riz9halalinchallah`
   - `ADMIN_PASSWORD_HASH` : hash PBKDF2 au format `salt_hex:hash_hex`, généré localement avec 310 000 itérations (voir `scripts/hash-admin-password.mjs`). Ne jamais mettre le mot de passe en clair dans GitHub.
   - `SESSION_SECRET` : valeur aléatoire longue (au moins 32 octets), générée localement. Secret uniquement dans Cloudflare.
4. Vérifier `GET /api/health`, puis tester une connexion valide et invalide, logout, accès non authentifié aux routes admin, lecture D1.
5. Vérifier les logs et le comportement des assets et routes avant de diriger le domaine public vers cette version.

## Routes préparées

- `GET /api/health` : santé du Worker et présence du binding.
- `POST /api/admin/login` et `POST /api/admin/logout` : session signée et cookie HttpOnly/Secure/SameSite=Strict.
- `GET /api/admin/session` : vérification de session.
- `GET/POST /api/admin/products` : lecture et ajout de produits.
- `GET /api/admin/orders`, `GET /api/admin/reservations` : lecture des listes.

## Limites avant production

- Ajouter une limitation de tentatives de connexion (Cloudflare Rate Limiting/WAF) avant exposition publique.
- Ajouter les opérations de mise à jour/suppression, validation complète et protections anti-CSRF adaptées avant administration complète.
- Les formulaires publics ne sont pas encore connectés à ces routes.
- Aucun paiement Stripe, confirmation courriel/SMS, calcul de livraison ou suivi livreur n'est activé.
- Les commandes et réservations ne doivent pas être annoncées comme opérationnelles tant que le parcours client complet et les notifications n'ont pas été développés et testés.
- Faire vérifier les prix, taxes, allergènes, informations nutritionnelles et toute affirmation halal par le propriétaire.
- Le dépôt étant public, ne jamais y committer de mot de passe, hash secret, jeton API ou clé Stripe.

## Retour arrière

Conserver le déploiement Cloudflare précédent et ne basculer le trafic qu'après tests. En cas d'échec, rétablir le déploiement précédent dans Cloudflare.
