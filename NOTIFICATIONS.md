# Messages automatiques, horaires et pause

## 1. Horaires (obligatoire à vérifier)
Dans `src/worker.js`, cherche `STORE_HOURS` (tout en haut du bloc « Commande avancée »).
Par défaut : **11 h – 22 h, 7 jours sur 7**. Change les heures pour qu'elles correspondent
aux vraies heures du restaurant. Exemple, fermé le lundi et deux plages le samedi :
`1: []`, `6: [["11:00","14:00"],["16:00","22:00"]]`.
Les commandes s'arrêtent 20 min avant la fermeture (`LAST_ORDER_BUFFER_MIN`).

## 2. Pause rapide
Dans `/restaurant/` : bouton **Mettre en pause** / **Reprendre les commandes**.

## 3. SMS et courriels (facultatif, le site fonctionne sans)
Cloudflare > Workers & Pages > ton projet > Settings > Variables and Secrets. Ajoute :

| Nom | Valeur |
|---|---|
| `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM` | compte Twilio (SMS), numéro expéditeur au format +1514… |
| `RESEND_API_KEY`, `MAIL_FROM` | compte Resend (courriel), ex. `Sparta Chicken <commande@ton-domaine.com>` |
| `OWNER_PHONE`, `OWNER_EMAIL` | où recevoir l'alerte « nouvelle commande » |

Sans ces variables, rien n'est envoyé et le client n'est pas informé d'un message.
Messages envoyés : commande reçue (client + restaurant), commande prête, commande annulée.
