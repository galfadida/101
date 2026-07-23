/**
 * שומר את הגדרות בוט הטלגרם ב-Firestore (config/telegram).
 * הטוקן מגיע ממשתנה סביבה BOT_TOKEN ואינו נשמר בקוד/גיט.
 *
 *   BOT_TOKEN=xx\:yy node scripts/set-bot-config.mjs
 */
import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

const token = process.env.BOT_TOKEN;
if (!token) { console.error("חסר BOT_TOKEN"); process.exit(1); }

const sa = JSON.parse(readFileSync("./service-account.json", "utf8"));
initializeApp({ credential: cert(sa), projectId: sa.project_id });
const db = getFirestore();

const ref = db.doc("config/telegram");
const existing = (await ref.get()).data() || {};
const secret = existing.secret || randomBytes(24).toString("hex");

await ref.set({ token, secret, owners: existing.owners || [] }, { merge: true });
console.log("saved config/telegram");
console.log("webhook secret:", secret);
