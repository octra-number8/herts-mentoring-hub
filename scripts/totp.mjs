// Prints the current TOTP code for a seeded test user: node scripts/totp.mjs pgm
import { generateSync } from "otplib";
import { readFileSync } from "node:fs";
const s = JSON.parse(readFileSync(".seed-secrets.json", "utf8"));
console.log(generateSync({ secret: s.users[process.argv[2] ?? "pgm"].totpSecret }));
