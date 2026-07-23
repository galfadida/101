/**
 * מחיקת כל נתוני הבדיקה: עובדים, טפסים, קישורים וקשירות.
 * מציג מה נמצא, מוחק, ומדפיס סיכום.
 *
 *   node scripts/reset-test-data.mjs           הצגה בלבד
 *   node scripts/reset-test-data.mjs --delete  מחיקה בפועל
 */
import { readFileSync } from "node:fs";
import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { getAuth } from "firebase-admin/auth";

const sa = JSON.parse(readFileSync("./service-account.json", "utf8"));
initializeApp({ credential: cert(sa), projectId: sa.project_id });
const db = getFirestore();
const DO_IT = process.argv.includes("--delete");

const employees = await db.collection("employees").get();
const invites = await db.collection("invites").get();
const bindings = await db.collection("bindings").get();

console.log("\nנמצא במסד:");
for (const d of employees.docs) {
  const v = d.data();
  const form = await d.ref.collection("form101").doc("current").get();
  const state = form.exists ? form.data().status : "לא התחיל";
  console.log(`  עובד  ${d.id}  ${v.firstName || ""} ${v.lastName || ""}  [${state}]`);
}
console.log(`  קישורים: ${invites.size}   קשירות: ${bindings.size}`);

if (!DO_IT) {
  console.log("\nלמחיקה בפועל: node scripts/reset-test-data.mjs --delete\n");
  process.exit(0);
}

for (const d of employees.docs) await db.recursiveDelete(d.ref);
for (const d of invites.docs) await d.ref.delete();
for (const d of bindings.docs) {
  await getAuth().deleteUser(d.id).catch(() => {});   // גם המשתמש האנונימי
  await d.ref.delete();
}

console.log(`\nנמחקו: ${employees.size} עובדים, ${invites.size} קישורים, ${bindings.size} קשירות.\n`);
process.exit(0);
