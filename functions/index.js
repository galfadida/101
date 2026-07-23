/**
 * בוט טלגרם ליצירת קישורי קליטה לעובדים חדשים.
 *
 * הזרימה: שולחים "101" → הבוט שואל שם מלא, טלפון, סניף, מגדר, שכר לשעה,
 * ואז יוצר עובד + קישור אישי ומחזיר אותו.
 *
 * הטוקן נשמר ב-Firestore (config/telegram) ולא בקוד — הפונקציה קוראת אותו בזמן ריצה.
 * שיחת המצב נשמרת ב-Firestore (botSessions/{chatId}).
 */
import { onRequest } from "firebase-functions/v2/https";
import { initializeApp } from "firebase-admin/app";
import { getFirestore, Timestamp, FieldValue } from "firebase-admin/firestore";
import { randomBytes } from "node:crypto";

initializeApp();
const db = getFirestore();

const SITE = "https://shaul-tamrukim-tofes-101.web.app";
const COMPANY = 'שאול בטיש הלוי שאול תמרוקים בע"מ';
const BRANCHES = ["שילת סנטר 1", "קניון רמות", "ברנדייס", "בית שמש", "בר אילן"];

/* ---------- Telegram API ---------- */
async function tg(token, method, payload) {
  const r = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return r.json();
}
const send = (token, chatId, text, extra = {}) =>
  tg(token, "sendMessage", { chat_id: chatId, text, parse_mode: "HTML", ...extra });

function keyboard(rows) {
  return { reply_markup: { inline_keyboard: rows } };
}

/* ---------- config + auth ---------- */
async function getConfig() {
  const snap = await db.doc("config/telegram").get();
  return snap.exists ? snap.data() : null;
}

// בוט פרטי: ה-chat הראשון שפונה הופך לבעלים; אחריו רק מורשים.
async function isAllowed(cfg, chatId) {
  const owners = cfg.owners || [];
  if (owners.length === 0) {
    await db.doc("config/telegram").set(
      { owners: FieldValue.arrayUnion(chatId) }, { merge: true });
    return true;
  }
  return owners.includes(chatId);
}

/* ---------- session ---------- */
const sessRef = (chatId) => db.doc(`botSessions/${chatId}`);
async function getSession(chatId) {
  const snap = await sessRef(chatId).get();
  return snap.exists ? snap.data() : null;
}
const setSession = (chatId, data) => sessRef(chatId).set(data, { merge: true });
const clearSession = (chatId) => sessRef(chatId).delete();

/* ---------- create employee ---------- */
function newToken() {
  return randomBytes(32).toString("base64url");
}
async function createEmployee(d) {
  const empRef = db.collection("employees").doc();
  const token = newToken();
  const expiresAt = Timestamp.fromMillis(Date.now() + 14 * 864e5);
  const profile = {
    firstName: d.firstName,
    lastName: d.lastName,
    gender: d.gender,
    branch: d.branch,
    mobile: d.mobile,
    company: COMPANY,
  };
  await db.batch()
    .set(empRef, { ...profile, hourlyWage: d.hourlyWage ?? null,
      status: "invited", createdAt: FieldValue.serverTimestamp(), source: "telegram" })
    .set(empRef.collection("public").doc("profile"), profile)
    .set(db.collection("invites").doc(token), {
      employeeId: empRef.id, revoked: false, expiresAt,
      claimedUid: null, claimedAt: null, createdAt: FieldValue.serverTimestamp(),
    })
    .commit();
  return { link: `${SITE}/?t=${token}`, employeeId: empRef.id };
}

/* ---------- helpers ---------- */
function splitName(full) {
  const parts = String(full).trim().split(/\s+/);
  if (parts.length === 1) return { firstName: parts[0], lastName: "" };
  return { firstName: parts[0], lastName: parts.slice(1).join(" ") };
}
function normMobile(v) {
  const d = String(v).replace(/\D/g, "");
  return /^05\d{8}$/.test(d) ? d : null;
}

/* ---------- flow ---------- */
async function startFlow(token, chatId) {
  await setSession(chatId, { step: "name", data: {}, updatedAt: FieldValue.serverTimestamp() });
  await send(token, chatId, "קליטת עובד חדש 🪷\n\nמה <b>השם המלא</b> של העובד?");
}

async function handleText(token, chatId, text, session) {
  const step = session.step;
  const data = session.data || {};

  if (step === "name") {
    const { firstName, lastName } = splitName(text);
    if (!firstName) return send(token, chatId, "נא לכתוב שם מלא.");
    data.firstName = firstName; data.lastName = lastName;
    await setSession(chatId, { step: "phone", data });
    return send(token, chatId, `יופי!\n\nמה <b>מספר הטלפון</b> של ${firstName}?`);
  }

  if (step === "phone") {
    const m = normMobile(text);
    if (!m) return send(token, chatId, "מספר נייד לא תקין. נא להזין מספר בן 10 ספרות שמתחיל ב-05.");
    data.mobile = m;
    await setSession(chatId, { step: "branch", data });
    return send(token, chatId, "באיזה <b>סניף</b> יעבוד?",
      keyboard(BRANCHES.map((b, i) => [{ text: b, callback_data: "br:" + i }])));
  }

  if (step === "wage") {
    const wage = Number(String(text).replace(/[^\d.]/g, ""));
    if (!wage || wage <= 0) return send(token, chatId, "נא להזין שכר לשעה במספרים, למשל 52.5");
    data.hourlyWage = wage;
    return finish(token, chatId, data);
  }

  // no active step
  return send(token, chatId, "כדי לקלוט עובד חדש, שלחי <b>101</b>");
}

async function handleCallback(token, chatId, dataStr, session) {
  const data = session.data || {};
  if (session.step === "branch" && dataStr.startsWith("br:")) {
    data.branch = BRANCHES[Number(dataStr.slice(3))] || BRANCHES[4];
    await setSession(chatId, { step: "gender", data });
    return send(token, chatId, `סניף: <b>${data.branch}</b>\n\n<b>מגדר</b>?`,
      keyboard([[{ text: "נקבה", callback_data: "g:f" }, { text: "זכר", callback_data: "g:m" }]]));
  }
  if (session.step === "gender" && dataStr.startsWith("g:")) {
    data.gender = dataStr.slice(2) === "m" ? "m" : "f";
    await setSession(chatId, { step: "wage", data });
    return send(token, chatId, "מה <b>השכר לשעה</b> (₪)?");
  }
}

async function finish(token, chatId, data) {
  await send(token, chatId, "יוצרת קישור… ⏳");
  try {
    const { link } = await createEmployee(data);
    await clearSession(chatId);
    const who = `${data.firstName} ${data.lastName}`.trim();
    await send(token, chatId,
      `✅ <b>${who}</b> נוצר בהצלחה!\n` +
      `סניף: ${data.branch} · שכר לשעה: ${data.hourlyWage} ₪\n\n` +
      `הקישור לשליחה בוואטספ (תקף 14 יום):\n${link}\n\n` +
      `לקליטת עובד נוסף — שלחי 101`,
      { disable_web_page_preview: true });
  } catch (e) {
    console.error("create failed", e);
    await send(token, chatId, "אירעה שגיאה ביצירת הקישור. נסי שוב עם 101.");
  }
}

/* ---------- webhook ---------- */
export const bot = onRequest({ region: "us-central1", cors: false }, async (req, res) => {
  const cfg = await getConfig();
  if (!cfg || !cfg.token) { res.status(200).send("no config"); return; }

  // אימות שהבקשה אכן מטלגרם, לפי secret token בכותרת
  if (cfg.secret && req.get("X-Telegram-Bot-Api-Secret-Token") !== cfg.secret) {
    res.status(401).send("bad secret"); return;
  }

  const update = req.body || {};
  try {
    if (update.callback_query) {
      const cq = update.callback_query;
      const chatId = cq.message.chat.id;
      await tg(cfg.token, "answerCallbackQuery", { callback_query_id: cq.id });
      if (!(await isAllowed(cfg, chatId))) {
        await send(cfg.token, chatId, `אין הרשאה. מזהה הצ'אט שלך: <code>${chatId}</code>`);
        res.status(200).send("ok"); return;
      }
      const session = await getSession(chatId);
      if (session) await handleCallback(cfg.token, chatId, cq.data, session);
      res.status(200).send("ok"); return;
    }

    const msg = update.message;
    if (msg && msg.text) {
      const chatId = msg.chat.id;
      const text = msg.text.trim();
      if (!(await isAllowed(cfg, chatId))) {
        await send(cfg.token, chatId,
          `הבוט הזה פרטי. מזהה הצ'אט שלך: <code>${chatId}</code>`);
        res.status(200).send("ok"); return;
      }
      if (/^101$/.test(text) || text === "/start") {
        await startFlow(cfg.token, chatId);
        res.status(200).send("ok"); return;
      }
      if (text === "/cancel") {
        await clearSession(chatId);
        await send(cfg.token, chatId, "בוטל. לקליטת עובד — שלחי 101");
        res.status(200).send("ok"); return;
      }
      const session = await getSession(chatId);
      if (session && session.step) await handleText(cfg.token, chatId, text, session);
      else await send(cfg.token, chatId, "כדי לקלוט עובד חדש, שלחי <b>101</b>");
    }
    res.status(200).send("ok");
  } catch (e) {
    console.error("webhook error", e);
    res.status(200).send("ok");
  }
});
