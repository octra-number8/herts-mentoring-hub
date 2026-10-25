// Prints the current TOTP code for a seeded test user.
//   node scripts/totp.mjs pgm                      (local)
//   SEED_SECRETS_FILE=.staging-secrets.json node scripts/totp.mjs pgm   (staging)
import { generateSync } from "otplib";
import { readFileSync } from "node:fs";
const s = JSON.parse(readFileSync(process.env.SEED_SECRETS_FILE ?? ".seed-secrets.json", "utf8"));
const u = s.users[process.argv[2] ?? "pgm"];
console.log(u.totpSecret ? generateSync({ secret: u.totpSecret }) : `${process.argv[2]} has no two-step verification`);
