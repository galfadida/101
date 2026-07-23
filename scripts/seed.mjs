/**
 * יצירת עובד + קישור אישי — מריצים מהמחשב בלבד, עם Admin SDK.
 * הלקוח לעולם אינו יכול ליצור עובדים או קישורים (חסום בכללים).
 *
 * שימוש:
 *   set GOOGLE_APPLICATION_CREDENTIALS=C:\path\service-account.json
 *   node scripts/seed.mjs --first "גל" --last "פדידה" --gender f --branch "בר אילן" --mobile 0546389555 --days 14
 *
 * פעולות נוספות:
 *   node scripts/seed.mjs --list
 *   node scripts/seed.mjs --revoke <token>
 *   node scripts/seed.mjs --grant-admin <uid>
 */
import { randomBytes } from "node:crypto";
import { initializeApp, applicationDefault } from "firebase-admin/app";
import { getFirestore, Timestamp, FieldValue } from "firebase-admin/firestore";
import { getAuth } from "firebase-admin/auth";

const PROJECT_ID = "shaul-tamrukim-tofes-101";
const COMPANY = 'שאול בטיש הלוי שאול תמרוקים בע"מ';
const BASE_URL = process.env.FORM_BASE_URL || "http://localhost:5173";

initializeApp({ credential: applicationDefault(), projectId: PROJECT_ID });
const db = getFirestore();

function arg(name, fallback = null) {
  const i = process.argv.indexOf("--" + name);
  return i > -1 ? process.argv[i + 1] : fallback;
}
function has(name) {
  return process.argv.includes("--" + name);
}

/** 32 בתים אקראיים = 256 ביט אנטרופיה, base64url — בלתי ניתן לניחוש */
function newToken() {
  return randomBytes(32).toString("base64url");
}

async function createEmployee() {
  const first = arg("first");
  const last = arg("last");
  if (!first || !last) {
    console.error("חסר --first / --last");
    process.exit(1);
  }
  const gender = arg("gender", "f");
  const branch = arg("branch", "בר אילן");
  const mobile = arg("mobile", "");
  const days = Number(arg("days", "14"));

  const empRef = db.collection("employees").doc();
  const token = newToken();
  const expiresAt = Timestamp.fromMillis(Date.now() + days * 24 * 60 * 60 * 1000);

  const batch = db.batch();

  // מידע פנימי של המעסיק — העובד אינו יכול לקרוא אותו
  batch.set(empRef, {
    firstName: first,
    lastName: last,
    gender,
    branch,
    mobile,
    company: COMPANY,
    status: "invited",
    createdAt: FieldValue.serverTimestamp(),
  });

  // התת-מסמך היחיד שהעובד רשאי לקרוא
  batch.set(empRef.collection("public").doc("profile"), {
    firstName: first,
    lastName: last,
    gender,
    branch,
    mobile,
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

  console.log("\n  עובד נוצר:", empRef.id);
  console.log("  תוקף הקישור עד:", expiresAt.toDate().toLocaleString("he-IL"));
  console.log("\n  קישור לשליחה בוואטספ:");
  console.log("  " + BASE_URL + "/?t=" + token + "\n");
}

async function listInvites() {
  const snap = await db.collection("invites").orderBy("createdAt", "desc").limit(50).get();
  for (const d of snap.docs) {
    const v = d.data();
    const emp = await db.doc(`employees/${v.employeeId}`).get();
    const name = emp.exists ? `${emp.data().firstName} ${emp.data().lastName}` : "(נמחק)";
    const state = v.revoked
      ? "בוטל"
      : v.expiresAt.toMillis() < Date.now()
        ? "פג תוקף"
        : v.claimedUid
          ? "נפתח"
          : "ממתין";
    console.log(`${state.padEnd(9)} ${name.padEnd(22)} ${d.id.slice(0, 12)}…`);
  }
}

async function revoke(token) {
  await db.collection("invites").doc(token).update({ revoked: true });
  console.log("הקישור בוטל. הגישה נחסמת מיידית, גם למי שכבר פתח אותו.");
}

async function grantAdmin(uid) {
  await getAuth().setCustomUserClaims(uid, { admin: true });
  console.log("הרשאת מנהל ניתנה ל-", uid, "— יש להתנתק ולהתחבר מחדש כדי שתיכנס לתוקף.");
}

const revokeToken = arg("revoke");
const adminUid = arg("grant-admin");

if (has("list")) await listInvites();
else if (revokeToken) await revoke(revokeToken);
else if (adminUid) await grantAdmin(adminUid);
else await createEmployee();

process.exit(0);
