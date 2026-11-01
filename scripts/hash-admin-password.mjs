import { randomBytes, pbkdf2Sync } from "node:crypto";
import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";

const rl = createInterface({ input: stdin, output: stdout });
const password = await rl.question("Mot de passe administrateur (saisie masquée non disponible ici; exécutez localement) : ");
rl.close();
if (password.length < 14) {
  console.error("Choisissez au moins 14 caractères.");
  process.exit(1);
}
const salt = randomBytes(16);
const hash = pbkdf2Sync(password, salt, 310000, 32, "sha256");
console.log("ADMIN_PASSWORD_HASH=" + salt.toString("hex") + ":" + hash.toString("hex"));
