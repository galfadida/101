/**
 * יצירת עובד הבדיקה + קישור אישי.
 * ערכי העברית כתובים כאן ולא מועברים כארגומנטים, כדי לא לעבור דרך ה-shell.
 *
 *   node scripts/create-test-employee.mjs
 */
import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore, Timestamp, FieldValue } from "firebase-admin/firestore";

const KEY_PATH = process.env.SA_KEY || "./service-account.json";
const BASE_URL = process.env.FORM_BASE_URL || "https://shaul-tamrukim-tofes-101.web.app";
const COMPANY = 'שאול בטיש הלוי שאול תמרוקים בע"מ';
const DAYS = 14;

const EMPLOYEE = {
  firstName: "גל",
  lastName: "פדידה",
  gender: "f",
  branch: "בר אילן",
  mobile: "0546389555",
};

const sa = JSON.parse(readFileSync(KEY_PATH, "utf8"));
initializeApp({ credential: cert(sa), projectId: sa.project_id });
const db = getFirestore();

const empRef = db.collection("employees").doc();
const token = randomBytes(32).toString("base64url");
const expiresAt = Timestamp.fromMillis(Date.now() + DAYS * 864e5);

const batch = db.batch();

batch.set(empRef, {
  ...EMPLOYEE,
  company: COMPANY,
  status: "invited",
  createdAt: FieldValue.serverTimestamp(),
});

batch.set(empRef.collection("public").doc("profile"), {
  ...EMPLOYEE,
  company: COMPANY,
});

batch.set(db.collection("invites").doc(token), {
  employeeId: empRef.id,
  revoked: false,
  expiresAt,
  claimedUid: null,
  claimedAt: null,
  createdAt: FieldValue.serverTimestamp(),
});

await batch.commit();

console.log("employeeId : " + empRef.id);
console.log("expires    : " + expiresAt.toDate().toISOString());
console.log("LINK       : " + BASE_URL + "/?t=" + token);
process.exit(0);
