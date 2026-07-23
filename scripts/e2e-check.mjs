/**
 * בדיקת קצה-לקצה מול הפרויקט האמיתי:
 * יוצרת עובד זמני, מדמה בדיוק את מה שהדפדפן עושה (התחברות אנונימית,
 * תפיסת הקישור, קשירה, קריאת פרופיל, שמירת טיוטה, הגשה),
 * מוודאת שהחסימות עובדות, ואז מוחקת הכול.
 *
 *   node scripts/e2e-check.mjs
 */
import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { initializeApp as initAdmin, cert } from "firebase-admin/app";
import { getFirestore as adminDb, Timestamp, FieldValue } from "firebase-admin/firestore";
import { getAuth as adminAuth } from "firebase-admin/auth";

import { initializeApp } from "firebase/app";
import { getAuth, signInAnonymously } from "firebase/auth";
import {
  getFirestore, doc, getDoc, setDoc, updateDoc, collection, getDocs,
} from "firebase/firestore";

const sa = JSON.parse(readFileSync("./service-account.json", "utf8"));
initAdmin({ credential: cert(sa), projectId: sa.project_id });
const admin = adminDb();

const clientApp = initializeApp({
  apiKey: "AIzaSyDkqN3M19jXibRbsh5J7SYsS26KrUmUdJQ",
  authDomain: "shaul-tamrukim-tofes-101.firebaseapp.com",
  projectId: "shaul-tamrukim-tofes-101",
  storageBucket: "shaul-tamrukim-tofes-101.firebasestorage.app",
  messagingSenderId: "713234481484",
  appId: "1:713234481484:web:0e01542c170e2fc6ab8fe9",
});
const cdb = getFirestore(clientApp);

let pass = 0, fail = 0;
const ok = (name) => { pass++; console.log("  ✔ " + name); };
const bad = (name, e) => { fail++; console.log("  ✘ " + name + (e ? "  -> " + (e.code || e.message) : "")); };

async function shouldPass(name, fn) {
  try { await fn(); ok(name); } catch (e) { bad(name, e); }
}
async function shouldFail(name, fn) {
  try { await fn(); bad(name + " (עבר ולא היה אמור)"); }
  catch { ok(name); }
}

// --- הקמה ---
const empRef = admin.collection("employees").doc();
const otherRef = admin.collection("employees").doc();
const token = randomBytes(32).toString("base64url");

await admin.batch()
  .set(empRef, { firstName: "בדיקה", lastName: "אוטומטית", gender: "f", branch: "בר אילן", salary: 12345, status: "invited" })
  .set(empRef.collection("public").doc("profile"), { firstName: "בדיקה", lastName: "אוטומטית", gender: "f", branch: "בר אילן" })
  .set(otherRef, { firstName: "עובד", lastName: "אחר", gender: "m", branch: "רמות", salary: 999 })
  .set(otherRef.collection("public").doc("profile"), { firstName: "עובד", lastName: "אחר", gender: "m", branch: "רמות" })
  .set(admin.collection("invites").doc(token), {
    employeeId: empRef.id, revoked: false,
    expiresAt: Timestamp.fromMillis(Date.now() + 864e5),
    claimedUid: null, claimedAt: null,
  })
  .commit();

console.log("\nעובד זמני:", empRef.id, "\n");

const { user } = await signInAnonymously(getAuth(clientApp));
const uid = user.uid;
console.log("uid אנונימי:", uid, "\n");

console.log("לפני קשירה — אמור להיחסם:");
await shouldFail("קריאת פרופיל בלי binding", () => getDoc(doc(cdb, "employees", empRef.id, "public", "profile")));
await shouldFail("רשימת עובדים", () => getDocs(collection(cdb, "employees")));

console.log("\nזרימת הקישור:");
await shouldPass("קריאת ה-invite לפי token", async () => {
  const snap = await getDoc(doc(cdb, "invites", token));
  if (!snap.exists()) throw new Error("not found");
});
await shouldPass("תפיסת הקישור", () =>
  updateDoc(doc(cdb, "invites", token), { claimedUid: uid, claimedAt: new Date() }));
await shouldPass("קשירת uid לעובד", () =>
  setDoc(doc(cdb, "bindings", uid), { employeeId: empRef.id, token, boundAt: new Date() }));

console.log("\nאחרי קשירה:");
await shouldPass("קריאת הפרופיל שלו", () => getDoc(doc(cdb, "employees", empRef.id, "public", "profile")));
await shouldPass("שמירת טיוטה", () =>
  setDoc(doc(cdb, "employees", empRef.id, "form101", "current"),
    { answers: { idNum: "301138541", firstName: "בדיקה" }, stepIndex: 4, status: "draft", updatedAt: new Date() },
    { merge: true }));
await shouldFail("קריאת רשומת העובד עצמה (שכר)", () => getDoc(doc(cdb, "employees", empRef.id)));
await shouldFail("שינוי הפרופיל", () => updateDoc(doc(cdb, "employees", empRef.id, "public", "profile"), { branch: "אחר" }));
await shouldFail("קריאת פרופיל של עובד אחר", () => getDoc(doc(cdb, "employees", otherRef.id, "public", "profile")));
await shouldFail("כתיבה לטופס של עובד אחר", () =>
  setDoc(doc(cdb, "employees", otherRef.id, "form101", "current"), { answers: {}, stepIndex: 0, status: "draft" }));
await shouldFail("הזרקת שדה זר", () =>
  setDoc(doc(cdb, "employees", empRef.id, "form101", "current"), { answers: {}, stepIndex: 1, status: "draft", salary: 1 }));

console.log("\nהגשה ונעילה:");
await shouldPass("הגשה סופית", () =>
  setDoc(doc(cdb, "employees", empRef.id, "form101", "current"),
    { answers: { idNum: "301138541" }, status: "submitted", submittedAt: new Date(), updatedAt: new Date() },
    { merge: true }));
await shouldFail("כתיבה אחרי הגשה", () =>
  updateDoc(doc(cdb, "employees", empRef.id, "form101", "current"), { answers: { idNum: "1" }, status: "draft" }));

console.log("\nביטול קישור:");
await admin.collection("invites").doc(token).update({ revoked: true });
await shouldFail("קריאת פרופיל אחרי ביטול", () => getDoc(doc(cdb, "employees", empRef.id, "public", "profile")));

// --- ניקוי ---
await admin.recursiveDelete(empRef);
await admin.recursiveDelete(otherRef);
await admin.collection("invites").doc(token).delete();
await admin.collection("bindings").doc(uid).delete();
await adminAuth().deleteUser(uid).catch(() => {});

console.log(`\nעבר: ${pass}   נכשל: ${fail}\n`);
process.exit(fail ? 1 : 0);
