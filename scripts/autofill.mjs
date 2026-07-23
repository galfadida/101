/**
 * ממלא את השאלון מקצה לקצה בדפדפן אמיתי, דרך קישור אישי, עם פרטי דמה.
 * בסיום שולף את התשובות מ-Firestore וכותב אותן ל-answers.json.
 *
 *   node scripts/autofill.mjs
 */
import { randomBytes } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore, Timestamp } from "firebase-admin/firestore";
import puppeteer from "puppeteer";

const SITE = "https://shaul-tamrukim-tofes-101.web.app";
const sa = JSON.parse(readFileSync("./service-account.json", "utf8"));
initializeApp({ credential: cert(sa), projectId: sa.project_id });
const db = getFirestore();

/** מייצר תעודת זהות תקינה (ספרת ביקורת נכונה) */
function makeId(prefix8) {
  const base = String(prefix8).padStart(8, "0").slice(0, 8);
  let sum = 0;
  for (let i = 0; i < 8; i++) {
    let d = Number(base[i]) * (i % 2 === 0 ? 1 : 2);
    if (d > 9) d -= 9;
    sum += d;
  }
  return base + String((10 - (sum % 10)) % 10);
}

const PERSON = { firstName: "מיכל", lastName: "כהן", gender: "f", branch: "קניון רמות", mobile: "0521234567" };
const DUMMY = {
  idNum: makeId("30113854"),
  birth: "12031992",
  aliya: "",
  city: "ירושלים",
  street: "בר אילן",
  houseNo: "9",
  email: "michal.cohen@example.com",
  spouseId: makeId("38730388"),
  spouseFirst: "יוסי",
  spouseLast: "כהן",
  spouseBirth: "05071989",
  kids: [
    { name: "נועם", id: makeId("21234567"), birth: "14022019" },
    { name: "שירה", id: makeId("31234567"), birth: "03092023" },
  ],
  otherEmployer: { name: "מאפיית הבוקר בע\"מ", address: "הרצל 12, ירושלים", taxFile: "912345678", income: "3200", tax: "410" },
};

const empRef = db.collection("employees").doc();
const token = randomBytes(32).toString("base64url");
await db.batch()
  .set(empRef, { ...PERSON, company: "שאול תמרוקים", status: "invited" })
  .set(empRef.collection("public").doc("profile"), PERSON)
  .set(db.collection("invites").doc(token), {
    employeeId: empRef.id, revoked: false,
    expiresAt: Timestamp.fromMillis(Date.now() + 3600e3), claimedUid: null, claimedAt: null,
  }).commit();

console.log("עובד:", empRef.id);

const browser = await puppeteer.launch({ headless: "new" });
const page = await browser.newPage();
await page.setViewport({ width: 430, height: 920, isMobile: true, hasTouch: true });
page.on("pageerror", (e) => console.log("[pageerror]", String(e).slice(0, 160)));

await page.goto(`${SITE}/?t=${token}`, { waitUntil: "networkidle2", timeout: 45000 });
await page.waitForFunction(
  () => document.querySelector("main .nav .btn-primary")?.textContent?.includes("מתחילים"),
  { timeout: 30000 });

const H = () => page.evaluate(() => document.querySelector("h1.q")?.textContent || "");
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const next = async () => {
  await page.evaluate(() => document.querySelector("main .nav .btn-primary")?.click());
  await wait(500);
};
const type = async (key, value) => {
  const sel = `[data-key="${key}"] input`;
  await page.click(sel, { clickCount: 3 });
  await page.keyboard.press("Backspace");
  await page.type(sel, value, { delay: 15 });
};
const pickCombo = async (key) => {
  await page.evaluate((k) => document.querySelector(`[data-key="${k}"] .combo-item`)?.click(), key);
  await wait(150);
};
const choose = async (text) => {
  const ok = await page.evaluate((t) => {
    const b = [...document.querySelectorAll(".choices .choice")].find((x) => x.textContent.includes(t));
    if (!b) return false;
    b.click();
    return true;
  }, text);
  if (!ok) throw new Error("לא נמצאה אפשרות: " + text);
  await wait(500);
};

await page.evaluate(() => document.querySelector("main .btn-primary")?.click());
await wait(500);

const visited = [];
for (let guard = 0; guard < 40; guard++) {
  const h = await H();
  if (!h) break;
  visited.push(h);

  if (h.includes("תעודת הזהות")) { await type("idNum", DUMMY.idNum); await next(); }
  else if (h.includes("השם המלא")) { await next(); }
  else if (h.includes("מתי נולדת")) { await type("birthDate", DUMMY.birth); await next(); }
  // בחירת מגדר מרעננת את המסך (שפת השאלון מתהפכת) ואינה מקדמת אוטומטית
  else if (h.includes("מגדר")) { await choose("נקבה"); await next(); }
  else if (h.includes("נולדת בישראל")) { await choose("כן"); }
  else if (h.includes("גרה") || h.includes("גר?")) {
    await type("city", DUMMY.city); await pickCombo("city");
    await type("street", DUMMY.street); await pickCombo("street");
    await type("houseNo", DUMMY.houseNo);
    await wait(6000);                       // השלמת המיקוד
    const zip = await page.evaluate(() => document.querySelector('[data-key="zip"] input').value);
    if (!/^\d{7}$/.test(zip)) await type("zip", "9510209");
    await next();
  }
  else if (h.includes("להשיג אותך")) {
    await type("email", DUMMY.email);
    await next();
  }
  else if (h.includes("תושבת ישראל") || h.includes("תושב ישראל")) { await choose("כן"); }
  else if (h.includes("קיבוץ")) { await choose("לא"); }
  else if (h.includes("קופת חולים")) { await choose("כן"); }
  else if (h.includes("באיזו קופה")) { await choose("כללית"); }
  else if (h.includes("המצב המשפחתי")) { await choose("נשואה"); }
  else if (h.includes("בן/בת הזוג") && h.includes("פרטי")) {
    await type("spouseId", DUMMY.spouseId);
    await type("spouseFirst", DUMMY.spouseFirst);
    await type("spouseLast", DUMMY.spouseLast);
    await type("spouseBirth", DUMMY.spouseBirth);
    await next();
  }
  else if (h.includes("לבן/בת הזוג יש הכנסה")) { await choose("יש הכנסה מעבודה"); }
  else if (h.includes("ילדים שטרם")) { await choose("כן"); }
  else if (h.includes("פרטי הילדים")) {
    for (let i = 0; i < DUMMY.kids.length; i++) {
      if (i > 0) { await page.evaluate(() => document.querySelector(".add-btn")?.click()); await wait(300); }
      const k = DUMMY.kids[i];
      await page.evaluate((idx, kid) => {
        const card = document.querySelectorAll(".card")[idx];
        const ins = card.querySelectorAll("input");
        const set = (el, v) => { el.value = v; el.dispatchEvent(new Event("input", { bubbles: true })); };
        set(ins[0], kid.name); set(ins[1], kid.id); set(ins[2], kid.birth);
      }, i, k);
      await wait(200);
    }
    await next();
  }
  else if (h.includes("תשלום")) { await choose("משכורת חודש"); }
  else if (h.includes("הכנסות נוספות?")) { await choose("יש לי הכנסות אחרות"); }
  else if (h.includes("מאיזה סוג")) {
    await page.evaluate(() => {
      const b = [...document.querySelectorAll(".choices .choice")].find((x) => x.textContent.includes("משכורת חודש"));
      b?.click();
    });
    await wait(200); await next();
  }
  else if (h.includes("נקודות הזיכוי")) { await choose("אבקש לקבל נקודות זיכוי"); }
  else if (h.includes("הצהרות נוספות")) {
    await page.evaluate(() => document.querySelectorAll(".choices .choice").forEach((b) => b.click()));
    await wait(200); await next();
  }
  else if (h.includes("פטור או זיכוי")) {
    await page.evaluate(() => {
      const items = [...document.querySelectorAll(".legal .choice")];
      const want = ["13", "15"];
      items.forEach((el) => { if (want.includes(el.querySelector(".num")?.textContent)) el.click(); });
    });
    await wait(300); await next();
  }
  else if (h.includes("תיאום מס?")) { await choose("כן, יש לי"); }
  else if (h.includes("סיבת הבקשה")) { await choose("יש לי הכנסות נוספות ממשכורת"); }
  else if (h.includes("פירוט ההכנסות")) {
    await page.evaluate(() => document.querySelector(".add-btn")?.click());
    await wait(300);
    await page.evaluate((m) => {
      const card = document.querySelector(".card");
      const ins = card.querySelectorAll("input");
      const set = (el, v) => { el.value = v; el.dispatchEvent(new Event("input", { bubbles: true })); };
      set(ins[0], m.name); set(ins[1], m.address); set(ins[2], m.taxFile);
      const kind = [...card.querySelectorAll(".choice")].find((x) => x.textContent.trim() === "עבודה");
      kind?.click();
      const rest = card.querySelectorAll("input");
      set(rest[3], m.income); set(rest[4], m.tax);
    }, DUMMY.otherEmployer);
    await wait(300); await next();
  }
  else if (h.includes("כמעט סיימנו")) {
    const box = await page.evaluate(() => {
      const c = document.querySelector(".sigwrap canvas").getBoundingClientRect();
      return { x: c.x, y: c.y, w: c.width, h: c.height };
    });
    const cx = box.x + box.w / 2, cy = box.y + box.h / 2;
    await page.mouse.move(cx - 70, cy + 10);
    await page.mouse.down();
    for (const [dx, dy] of [[-40, -25], [-10, 20], [15, -30], [40, 10], [70, -20]]) {
      await page.mouse.move(cx + dx, cy + dy, { steps: 8 });
    }
    await page.mouse.up();
    await wait(400);
    await next();
    break;
  }
  else { await next(); }
}

await wait(2500);
const done = await page.evaluate(() => !!document.querySelector(".done"));
const stepErrLive = await page.evaluate(() => document.querySelector(".step-error.show")?.textContent || "");
if (stepErrLive) console.log("שגיאה על המסך:", stepErrLive);
console.log("מסכים שעברנו:", visited.length, "| הגיע למסך סיום:", done ? "כן" : "לא");
visited.forEach((v, i) => console.log("  " + (i + 1) + ". " + v));
const stepErr = await page.evaluate(() => document.querySelector(".step-error.show")?.textContent || "").catch(() => "");
if (stepErr) console.log("שגיאה על המסך:", stepErr);
await browser.close();

const snap = await db.doc(`employees/${empRef.id}/form101/current`).get();
if (!snap.exists) { console.log("לא נשמר טופס"); process.exit(1); }
const data = snap.data();
writeFileSync("answers.json", JSON.stringify({
  answers: data.answers, taxYear: String(new Date().getFullYear()),
  employeeNumber: "24", status: data.status,
}, null, 1), "utf8");
console.log("סטטוס:", data.status, "| נכתב answers.json");
process.exit(0);
