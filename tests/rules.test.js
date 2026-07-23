/**
 * בדיקות אבטחה מול Firestore Emulator.
 * הרצה:  npm run test:rules
 */
import { readFileSync } from "node:fs";
import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
} from "@firebase/rules-unit-testing";
import {
  doc, getDoc, setDoc, updateDoc, deleteDoc, collection, getDocs,
} from "firebase/firestore";

const EMP_A = "empA";
const EMP_B = "empB";
const TOKEN_A = "tokenAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";
const TOKEN_B = "tokenBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB";
const TOKEN_REVOKED = "tokenRevokedXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX";
const TOKEN_EXPIRED = "tokenExpiredXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX";

const UID_A = "anonA";
const UID_B = "anonB";
const UID_INTRUDER = "anonIntruder";

const future = new Date(Date.now() + 7 * 864e5);
const past = new Date(Date.now() - 864e5);

let testEnv;

const anon = (uid) => testEnv.authenticatedContext(uid, { firebase: { sign_in_provider: "anonymous" } }).firestore();
const admin = () => testEnv.authenticatedContext("bossUid", { admin: true, firebase: { sign_in_provider: "password" } }).firestore();
const adminAnon = () => testEnv.authenticatedContext("fakeBoss", { admin: true, firebase: { sign_in_provider: "anonymous" } }).firestore();
const guest = () => testEnv.unauthenticatedContext().firestore();

before(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: "shaul-rules-test",
    firestore: {
      rules: readFileSync("firestore.rules", "utf8"),
      host: "127.0.0.1",
      port: 8085,
    },
  });

  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    for (const [id, name] of [[EMP_A, "גל"], [EMP_B, "דנה"]]) {
      await setDoc(doc(db, "employees", id), {
        firstName: name, lastName: "בדיקה", gender: "f", branch: "בר אילן",
        salary: 12000, status: "invited", company: "שאול תמרוקים",
      });
      await setDoc(doc(db, "employees", id, "public", "profile"), {
        firstName: name, lastName: "בדיקה", gender: "f", branch: "בר אילן",
      });
    }
    const inv = (employeeId, expiresAt, revoked, claimedUid) =>
      ({ employeeId, expiresAt, revoked, claimedUid, claimedAt: null });
    await setDoc(doc(db, "invites", TOKEN_A), inv(EMP_A, future, false, null));
    await setDoc(doc(db, "invites", TOKEN_B), inv(EMP_B, future, false, null));
    await setDoc(doc(db, "invites", TOKEN_REVOKED), inv(EMP_A, future, true, null));
    await setDoc(doc(db, "invites", TOKEN_EXPIRED), inv(EMP_A, past, false, null));
  });
});

after(async () => { await testEnv.cleanup(); });

/** מבצע claim + binding כמו הלקוח האמיתי */
async function claimAndBind(uid, token, employeeId) {
  const db = anon(uid);
  // התפיסה חוקית פעם אחת בלבד; בקריאה חוזרת של אותו משתמש היא נדחית — וזה תקין
  try {
    await updateDoc(doc(db, "invites", token), { claimedUid: uid, claimedAt: new Date() });
  } catch { /* already claimed by this uid */ }
  await setDoc(doc(db, "bindings", uid), { employeeId, token, boundAt: new Date() });
  return db;
}

describe("1 · אימות אנונימי לבדו אינו מקנה גישה", () => {
  it("אנונימי בלי binding לא קורא פרופיל של עובד", async () => {
    await assertFails(getDoc(doc(anon("nobody"), "employees", EMP_A, "public", "profile")));
  });
  it("אנונימי בלי binding לא קורא טופס", async () => {
    await assertFails(getDoc(doc(anon("nobody"), "employees", EMP_A, "form101", "current")));
  });
  it("אנונימי בלי binding לא כותב טופס", async () => {
    await assertFails(setDoc(doc(anon("nobody"), "employees", EMP_A, "form101", "current"),
      { answers: {}, stepIndex: 0, status: "draft" }));
  });
  it("משתמש לא מזוהה לא קורא כלום", async () => {
    await assertFails(getDoc(doc(guest(), "invites", TOKEN_A)));
  });
});

describe("2 · אין רשימות ואין שאילתות על עובדים", () => {
  it("עובד מאומת לא יכול לרשום את אוסף העובדים", async () => {
    await claimAndBind(UID_A, TOKEN_A, EMP_A);
    await assertFails(getDocs(collection(anon(UID_A), "employees")));
  });
  it("עובד לא יכול לרשום קישורים", async () => {
    await assertFails(getDocs(collection(anon(UID_A), "invites")));
  });
  it("עובד לא יכול לרשום bindings של אחרים", async () => {
    await assertFails(getDocs(collection(anon(UID_A), "bindings")));
  });
});

describe("3 · העובד ניגש רק לרשומה שלו", () => {
  it("קורא את הפרופיל שלו", async () => {
    const db = await claimAndBind(UID_A, TOKEN_A, EMP_A);
    await assertSucceeds(getDoc(doc(db, "employees", EMP_A, "public", "profile")));
  });
  it("לא קורא פרופיל של עובד אחר", async () => {
    await assertFails(getDoc(doc(anon(UID_A), "employees", EMP_B, "public", "profile")));
  });
  it("לא קורא טופס של עובד אחר", async () => {
    await assertFails(getDoc(doc(anon(UID_A), "employees", EMP_B, "form101", "current")));
  });
  it("לא כותב לטופס של עובד אחר", async () => {
    await assertFails(setDoc(doc(anon(UID_A), "employees", EMP_B, "form101", "current"),
      { answers: { idNum: "1" }, stepIndex: 0, status: "draft" }));
  });
});

describe("4 · מידע פנימי של המעסיק סגור בפני העובד", () => {
  it("לא קורא את רשומת העובד עצמה (שכר, סטטוס)", async () => {
    await assertFails(getDoc(doc(anon(UID_A), "employees", EMP_A)));
  });
  it("לא כותב לרשומת העובד", async () => {
    await assertFails(updateDoc(doc(anon(UID_A), "employees", EMP_A), { salary: 99999 }));
  });
  it("לא משנה את הפרופיל הגלוי (שם / סניף)", async () => {
    await assertFails(updateDoc(doc(anon(UID_A), "employees", EMP_A, "public", "profile"),
      { branch: "סניף אחר", firstName: "מישהו" }));
  });
});

describe("5 · העובד כותב רק את שדות הטופס", () => {
  it("כותב טיוטה תקינה", async () => {
    const db = anon(UID_A);
    await assertSucceeds(setDoc(doc(db, "employees", EMP_A, "form101", "current"),
      { answers: { idNum: "301138541" }, stepIndex: 3, status: "draft", updatedAt: new Date() }));
  });
  it("לא מזריק שדות זרים", async () => {
    await assertFails(setDoc(doc(anon(UID_A), "employees", EMP_A, "form101", "current"),
      { answers: {}, stepIndex: 1, status: "draft", salary: 99999 }));
  });
  it("לא ממציא סטטוס", async () => {
    await assertFails(setDoc(doc(anon(UID_A), "employees", EMP_A, "form101", "current"),
      { answers: {}, stepIndex: 1, status: "approved" }));
  });
  it("לא כותב לתת-אוסף אחר של העובד", async () => {
    await assertFails(setDoc(doc(anon(UID_A), "employees", EMP_A, "internal", "notes"), { x: 1 }));
  });
});

describe("6 · נעילה אחרי הגשה", () => {
  it("מגיש", async () => {
    await assertSucceeds(setDoc(doc(anon(UID_A), "employees", EMP_A, "form101", "current"),
      { answers: { idNum: "301138541" }, stepIndex: 25, status: "submitted", submittedAt: new Date() }));
  });
  it("לא יכול לשנות אחרי הגשה", async () => {
    await assertFails(updateDoc(doc(anon(UID_A), "employees", EMP_A, "form101", "current"),
      { answers: { idNum: "999" }, status: "draft" }));
  });
  it("מנהל כן יכול", async () => {
    await assertSucceeds(updateDoc(doc(admin(), "employees", EMP_A, "form101", "current"),
      { status: "draft" }));
  });
});

describe("7 · תפיסת הקישור והקשירה", () => {
  it("קישור תפוס לא ניתן לתפיסה מחדש ע\"י אחר", async () => {
    await assertFails(updateDoc(doc(anon(UID_INTRUDER), "invites", TOKEN_A),
      { claimedUid: UID_INTRUDER, claimedAt: new Date() }));
  });
  it("לא ניתן לשנות שדות אחרים ב-invite", async () => {
    await assertFails(updateDoc(doc(anon(UID_B), "invites", TOKEN_B),
      { claimedUid: UID_B, claimedAt: new Date(), revoked: false, employeeId: EMP_A }));
  });
  it("binding עם employeeId שאינו תואם ל-invite נדחה", async () => {
    const db = anon(UID_B);
    await updateDoc(doc(db, "invites", TOKEN_B), { claimedUid: UID_B, claimedAt: new Date() });
    await assertFails(setDoc(doc(db, "bindings", UID_B),
      { employeeId: EMP_A, token: TOKEN_B, boundAt: new Date() }));
  });
  it("binding תקין מתקבל", async () => {
    await assertSucceeds(setDoc(doc(anon(UID_B), "bindings", UID_B),
      { employeeId: EMP_B, token: TOKEN_B, boundAt: new Date() }));
  });
  it("לא ניתן לכתוב binding עבור uid אחר", async () => {
    await assertFails(setDoc(doc(anon(UID_INTRUDER), "bindings", UID_A),
      { employeeId: EMP_A, token: TOKEN_A, boundAt: new Date() }));
  });
  it("לא ניתן לזייף binding בלי token אמיתי", async () => {
    await assertFails(setDoc(doc(anon(UID_INTRUDER), "bindings", UID_INTRUDER),
      { employeeId: EMP_A, token: "made-up-token", boundAt: new Date() }));
  });
});

describe("8 · ביטול ותוקף", () => {
  it("קישור מבוטל לא מאפשר קשירה", async () => {
    const db = anon("anonRev");
    await assertFails(updateDoc(doc(db, "invites", TOKEN_REVOKED),
      { claimedUid: "anonRev", claimedAt: new Date() }));
    await assertFails(setDoc(doc(db, "bindings", "anonRev"),
      { employeeId: EMP_A, token: TOKEN_REVOKED, boundAt: new Date() }));
  });
  it("קישור שפג תוקפו לא מאפשר קשירה", async () => {
    const db = anon("anonExp");
    await assertFails(updateDoc(doc(db, "invites", TOKEN_EXPIRED),
      { claimedUid: "anonExp", claimedAt: new Date() }));
  });
  it("ביטול קישור קיים חוסם גישה מיידית למי שכבר נקשר", async () => {
    // UID_B נקשר ל-EMP_B בהצלחה; מבטלים את הקישור שלו
    await assertSucceeds(getDoc(doc(anon(UID_B), "employees", EMP_B, "public", "profile")));
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await updateDoc(doc(ctx.firestore(), "invites", TOKEN_B), { revoked: true });
    });
    await assertFails(getDoc(doc(anon(UID_B), "employees", EMP_B, "public", "profile")));
    await assertFails(setDoc(doc(anon(UID_B), "employees", EMP_B, "form101", "current"),
      { answers: {}, stepIndex: 1, status: "draft" }));
  });
});

describe("9 · הרשאות מנהל", () => {
  it("מנהל קורא רשומת עובד מלאה", async () => {
    await assertSucceeds(getDoc(doc(admin(), "employees", EMP_A)));
  });
  it("מנהל רושם עובדים", async () => {
    await assertSucceeds(getDocs(collection(admin(), "employees")));
  });
  it("מנהל יוצר קישור", async () => {
    await assertSucceeds(setDoc(doc(admin(), "invites", "newTokenFromAdmin"),
      { employeeId: EMP_A, revoked: false, expiresAt: future, claimedUid: null, claimedAt: null }));
  });
  it("עובד לא יוצר קישור", async () => {
    await assertFails(setDoc(doc(anon(UID_A), "invites", "selfMadeToken"),
      { employeeId: EMP_A, revoked: false, expiresAt: future, claimedUid: null, claimedAt: null }));
  });
  it("claim של admin על משתמש אנונימי אינו מקנה הרשאות מנהל", async () => {
    await assertFails(getDoc(doc(adminAnon(), "employees", EMP_A)));
    await assertFails(getDocs(collection(adminAnon(), "employees")));
  });
});

describe("10 · ברירת מחדל חוסמת", () => {
  it("אוסף לא מוכר חסום לעובד", async () => {
    await assertFails(getDoc(doc(anon(UID_A), "secrets", "x")));
    await assertFails(setDoc(doc(anon(UID_A), "secrets", "x"), { a: 1 }));
  });
});
