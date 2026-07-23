import "./styles.css";
import { startApp } from "./app.js";
import { LOGO } from "./logo.js";
import {
  tokenFromUrl, openInvite, loadForm, makeDebouncedSaver, submitForm, InviteError,
} from "./data.js";

const main = document.getElementById("main");
const DEV_OPEN = import.meta.env.DEV && new URLSearchParams(location.search).has("dev");

function screenMessage(title, body, tone = "info") {
  document.getElementById("topbar").classList.add("hidden");
  main.innerHTML = "";
  const w = document.createElement("section");
  w.className = "welcome step-anim";
  w.innerHTML = `
    <img class="logo" src="${LOGO}" alt="שאול תמרוקים">
    <h1 class="hello">${title}</h1>
    <div class="notice ${tone}" style="margin-top:18px;text-align:start">${body}</div>`;
  main.appendChild(w);
}

const MESSAGES = {
  missing: ["הקישור חסר", "נראה שהקישור לא הועתק במלואו. בקשי מהמנהל לשלוח אותו שוב."],
  notfound: ["הקישור אינו תקין", "לא מצאנו את הקישור הזה. בקשי מהמנהל לשלוח קישור חדש."],
  revoked: ["הקישור בוטל", "הקישור הזה בוטל. בקשי מהמנהל לשלוח קישור חדש."],
  expired: ["תוקף הקישור פג", "הקישור היה תקף לזמן מוגבל. בקשי מהמנהל לשלוח קישור חדש."],
  claimed: ["הקישור כבר בשימוש", "הקישור נפתח כבר במכשיר אחר. אם זו טעות, בקשי מהמנהל לשלוח קישור חדש."],
  denied: ["אין גישה", "לא ניתן לפתוח את הטופס עם הקישור הזה."],
  noprofile: ["רשומת העובד לא נמצאה", "פני למנהל כדי שיקים את הרשומה מחדש."],
};

async function boot() {
  const token = tokenFromUrl();

  // מצב פיתוח מקומי בלבד: ?dev — ללא Firebase, נתוני בדיקה, שמירה מקומית
  if (!token && DEV_OPEN) {
    startApp({ storeKey: "tofes101_dev" });
    return;
  }

  screenMessage("רגע…", "מאמתים את הקישור");

  let session;
  try {
    session = await openInvite(token);
  } catch (e) {
    const key = e instanceof InviteError ? e.code : "denied";
    const [title, body] = MESSAGES[key] || MESSAGES.denied;
    screenMessage(title, body, "warn");
    return;
  }

  const { employeeId, profile } = session;
  const draft = await loadForm(employeeId).catch(() => null);
  const saver = makeDebouncedSaver(employeeId);

  window.addEventListener("pagehide", () => saver.flushNow());
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") saver.flushNow();
  });

  startApp({
    profile,
    draft,
    saver,
    storeKey: "tofes101_" + employeeId,
    submit: async (answers) => {
      await saver.flushNow();
      await submitForm(employeeId, answers);
    },
  });
}

boot();
