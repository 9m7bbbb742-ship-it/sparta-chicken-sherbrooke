import { randomBytes, pbkdf2Sync } from "node:crypto";
import { stdin, stdout } from "node:process";

if (!stdin.isTTY || typeof stdin.setRawMode !== "function") {
  console.error("Lancez ce script dans un vrai terminal interactif.");
  process.exit(1);
}

stdout.write("Mot de passe administrateur (14 caractères minimum) : ");
stdin.setRawMode(true);
stdin.setEncoding("utf8");
stdin.resume();

let password = "";
const finish = () => {
  stdin.setRawMode(false);
  stdin.pause();
  stdout.write("\n");
};

stdin.on("data", (chunk) => {
  for (const ch of chunk) {
    if (ch === "\\u0003") {
      finish();
      process.exit(130);
    }
    if (ch === "\\r" || ch === "\\n") {
      finish();
      if (password.length < 14) {
        console.error("Choisissez au moins 14 caractères.");
        process.exit(1);
      }
      const salt = randomBytes(16);
      const hash = pbkdf2Sync(password, salt, 310000, 32, "sha256");
      password = "";
      console.log("ADMIN_PASSWORD_HASH=" + salt.toString("hex") + ":" + hash.toString("hex"));
      process.exit(0);
    }
    if (ch === "\\u007f" || ch === "\\b") {
      password = password.slice(0, -1);
      continue;
    }
    if (ch >= " " && ch <= "~") password += ch;
  }
});
