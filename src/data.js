import { db, ensureAnonUser } from "./firebase.js";
import {
  doc, getDoc, setDoc, updateDoc, serverTimestamp,
} from "firebase/firestore";

/**
 * זרימת הגישה של העובד:
 *   1. הקישור מכיל token אקראי באורך 256 ביט:  ?t=<token>
 *   2. התחברות אנונימית -> uid
 *   3. קריאת invites/{token} לפי מזהה מדויק (get בלבד, list חסום בכללים)
 *   4. יצירת bindings/{uid} שקושר את ה-uid לעובד — הכללים מאמתים מול ה-invite
 *   5. מכאן ואילך כל גישה נבדקת מול ה-binding + תוקף וביטול ה-invite
 *
 * אימות אנונימי לבדו אינו נותן גישה לשום מסמך.
 */

export class InviteError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

export function tokenFromUrl() {
  const p = new URLSearchParams(location.search);
  return p.get("t") || "";
}

/** מאמת את הקישור, קושר את המשתמש האנונימי לעובד, ומחזיר את הפרופיל הגלוי לעובד */
export async function openInvite(token) {
  if (!token) throw new InviteError("missing", "לא נמצא קוד בקישור");

  const user = await ensureAnonUser();
  const uid = user.uid;

  const inviteRef = doc(db, "invites", token);
  let invite;
  try {
    invite = await getDoc(inviteRef);
  } catch {
    throw new InviteError("denied", "הקישור אינו תקין");
  }
  if (!invite.exists()) throw new InviteError("notfound", "הקישור אינו תקין");

  const data = invite.data();
  if (data.revoked) throw new InviteError("revoked", "הקישור בוטל");
  if (data.expiresAt?.toMillis?.() < Date.now()) throw new InviteError("expired", "תוקף הקישור פג");
  if (data.claimedUid && data.claimedUid !== uid) {
    throw new InviteError("claimed", "הקישור כבר נפתח במכשיר אחר");
  }

  // 1. תפיסת הקישור: רושמים את ה-uid ב-invite (פעם אחת בלבד, נאכף בכללים)
  if (!data.claimedUid) {
    await updateDoc(inviteRef, { claimedUid: uid, claimedAt: serverTimestamp() });
  }

  // 2. קשירת ה-uid לעובד. הכללים מאמתים מול ה-invite שה-employeeId זהה,
  //    שהקישור בתוקף, שלא בוטל, ושהוא נתפס בדיוק ע"י ה-uid הזה.
  await setDoc(
    doc(db, "bindings", uid),
    { employeeId: data.employeeId, token, boundAt: serverTimestamp() },
    { merge: false },
  );

  const profileSnap = await getDoc(doc(db, "employees", data.employeeId, "public", "profile"));
  if (!profileSnap.exists()) throw new InviteError("noprofile", "רשומת העובד לא נמצאה");

  return {
    employeeId: data.employeeId,
    profile: profileSnap.data(),
  };
}

const FORM_DOC = (employeeId) => doc(db, "employees", employeeId, "form101", "current");

/** טוען טיוטה קיימת, אם יש */
export async function loadForm(employeeId) {
  const snap = await getDoc(FORM_DOC(employeeId));
  return snap.exists() ? snap.data() : null;
}

/** שמירת טיוטה — נקראת בדיבאונס תוך כדי מילוי */
export async function saveDraft(employeeId, answers, stepIndex) {
  await setDoc(
    FORM_DOC(employeeId),
    { answers, stepIndex, status: "draft", updatedAt: serverTimestamp() },
    { merge: true },
  );
}

/** הגשה סופית — לאחריה הכללים חוסמים כתיבה נוספת */
export async function submitForm(employeeId, answers) {
  await setDoc(
    FORM_DOC(employeeId),
    { answers, status: "submitted", submittedAt: serverTimestamp(), updatedAt: serverTimestamp() },
    { merge: true },
  );
}

/** דיבאונס לשמירת טיוטה, כדי לא לכתוב על כל הקשה */
export function makeDebouncedSaver(employeeId, delay = 1200) {
  let timer = null;
  let pending = null;
  let inFlight = false;

  async function flush() {
    if (!pending || inFlight) return;
    const payload = pending;
    pending = null;
    inFlight = true;
    try {
      await saveDraft(employeeId, payload.answers, payload.stepIndex);
    } catch (e) {
      console.warn("draft save failed", e);
    } finally {
      inFlight = false;
      if (pending) flush();
    }
  }

  return {
    queue(answers, stepIndex) {
      pending = { answers, stepIndex };
      clearTimeout(timer);
      timer = setTimeout(flush, delay);
    },
    flushNow() {
      clearTimeout(timer);
      return flush();
    },
  };
}
