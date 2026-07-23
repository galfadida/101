/**
 * בדיקת השלמת המיקוד בדפדפן אמיתי, מול האתר החי.
 * יוצר קישור זמני, עובר את השאלון עד מסך הכתובת, בודק כמה כתובות,
 * ומוחק אחריו הכול. לא מבצע פריסה.
 *
 *   node scripts/zip-e2e.mjs
 */
import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore, Timestamp } from "firebase-admin/firestore";
import puppeteer from "puppeteer";

const SITE = "https://shaul-tamrukim-tofes-101.web.app";
const sa = JSON.parse(readFileSync("./service-account.json", "utf8"));
initializeApp({ credential: cert(sa), projectId: sa.project_id });
const db = getFirestore();

const CASES = [
  { city: "ירושלים", street: "בר אילן", house: "9" },
  { city: "ירושלים", street: "הנשיא השישי", house: "16" },
  { city: "בית שמש", street: "נחל שורק", house: "12" },
  { city: "תל אביב - יפו", street: "רוטשילד", house: "45" },
  { city: "אלעד", street: "רבי עקיבא", house: "3" },
];

// --- עובד זמני ---
const empRef = db.collection("employees").doc();
const token = randomBytes(32).toString("base64url");
const person = { firstName: "בדיקת", lastName: "מיקוד", gender: "f", branch: "בר אילן", mobile: "0546389555" };

await db.batch()
  .set(empRef, { ...person, company: "שאול תמרוקים", status: "invited" })
  .set(empRef.collection("public").doc("profile"), person)
  .set(db.collection("invites").doc(token), {
    employeeId: empRef.id, revoked: false,
    expiresAt: Timestamp.fromMillis(Date.now() + 3600e3),
    claimedUid: null, claimedAt: null,
  })
  .commit();

const browser = await puppeteer.launch({ headless: "new", args: ["--lang=he-IL"] });
const page = await browser.newPage();
await page.setViewport({ width: 420, height: 900, isMobile: true, hasTouch: true });

const mapsCalls = [];
page.on("request", (r) => {
  const u = r.url();
  if (u.includes("maps.googleapis.com")) mapsCalls.push(u.split("?")[0]);
});
const pageErrors = [];
page.on("pageerror", (e) => pageErrors.push(String(e)));
page.on("console", (m) => { if (m.type() === "error") pageErrors.push("console: " + m.text()); });

const results = [];

try {
  await page.goto(`${SITE}/?t=${token}`, { waitUntil: "networkidle2", timeout: 45000 });

  // ה-token אמור להיעלם משורת הכתובת
  const urlAfter = page.url();
  console.log("\nURL אחרי טעינה:", urlAfter);
  console.log("token הוסר מה-URL:", !urlAfter.includes(token) ? "כן ✔" : "לא ✘");

  const stored = await page.evaluate(() => JSON.stringify(localStorage));
  console.log("token נמצא ב-localStorage:", stored.includes(token) ? "כן ✘" : "לא ✔");

  const helpers = {
    async clickText(sel, text) {
      const done = await page.evaluate((sel, text) => {
        const el = [...document.querySelectorAll(sel)].find((e) => e.textContent.includes(text));
        if (el) { el.click(); return true; }
        return false;
      }, sel, text);
      return done;
    },
  };

  async function heading() {
    return page.evaluate(() => document.querySelector("h1.q")?.textContent || "");
  }
  async function typeInto(dataKey, value) {
    const sel = `[data-key="${dataKey}"] input`;
    await page.click(sel, { clickCount: 3 });
    await page.type(sel, value, { delay: 25 });
  }
  async function next() {
    await page.evaluate(() => document.querySelector("main .nav .btn-primary")?.click());
    await new Promise((r) => setTimeout(r, 450));
  }

  // welcome
  await page.evaluate(() => document.querySelector("main .btn-primary")?.click());
  await new Promise((r) => setTimeout(r, 400));

  // לצעוד עד מסך הכתובת
  for (let i = 0; i < 12; i++) {
    const h = await heading();
    if (h.includes("גרה") || h.includes("גר?")) break;
    const hasChoices = await page.evaluate(() => {
      const box = document.querySelector(".choices");
      if (!box || box.querySelector('[aria-checked="true"]')) return false;
      box.children[0].click();
      return true;
    });
    if (hasChoices) { await new Promise((r) => setTimeout(r, 400)); continue; }
    await page.evaluate(() => {
      document.querySelectorAll("main input").forEach((inp) => {
        if (inp.value) return;
        const set = (v) => {
          inp.value = v;
          inp.dispatchEvent(new Event("input", { bubbles: true }));
        };
        if (inp.classList.contains("date-in")) set("14051990");
        else if (inp.maxLength === 9) set("301138541");
        else set("בדיקה");
      });
    });
    await next();
  }

  console.log("\nמסך:", await heading(), "\n");

  for (const c of CASES) {
    await page.evaluate(() => {
      ["city", "street", "houseNo", "zip"].forEach((k) => {
        const i = document.querySelector(`[data-key="${k}"] input`);
        if (i) { i.value = ""; i.dispatchEvent(new Event("input", { bubbles: true })); }
      });
    });
    await typeInto("city", c.city);
    await page.evaluate(() => document.querySelector('[data-key="city"] .combo-item')?.click());
    await typeInto("street", c.street);
    await page.evaluate(() => document.querySelector('[data-key="street"] .combo-item')?.click());
    await typeInto("houseNo", c.house);

    // ממתינים לתוצאת החיפוש
    let zip = "", hint = "";
    for (let t = 0; t < 40; t++) {
      await new Promise((r) => setTimeout(r, 400));
      ({ zip, hint } = await page.evaluate(() => ({
        zip: document.querySelector('[data-key="zip"] input')?.value || "",
        hint: document.querySelector('[data-key="zip"] .hint')?.textContent || "",
      })));
      if (/^\d{7}$/.test(zip) || hint.includes("לא הצלחנו")) break;
    }
    results.push({ ...c, zip, hint });
    console.log(
      `${(c.street + " " + c.house + ", " + c.city).padEnd(32)} -> ${zip ? zip : "(ריק)"}   ${hint}`,
    );
  }

  // הזנה ידנית עדיין אפשרית
  await page.evaluate(() => {
    const i = document.querySelector('[data-key="zip"] input');
    i.value = ""; i.dispatchEvent(new Event("input", { bubbles: true }));
    i.value = "1234567"; i.dispatchEvent(new Event("input", { bubbles: true }));
  });
  const manual = await page.evaluate(() => document.querySelector('[data-key="zip"] input').value);
  console.log("\nהזנה ידנית אפשרית:", manual === "1234567" ? "כן ✔" : "לא ✘ (" + manual + ")");

  console.log("\nקריאות ל-Google:", [...new Set(mapsCalls)].join("\n  ") || "(אין)");
  console.log("שגיאות בעמוד:", pageErrors.length ? "\n  " + pageErrors.join("\n  ") : "אין ✔");
} finally {
  await browser.close();
  await db.recursiveDelete(empRef);
  await db.collection("invites").doc(token).delete();
  const binds = await db.collection("bindings").where("employeeId", "==", empRef.id).get();
  for (const b of binds.docs) await b.ref.delete();
  console.log("\nניקוי הושלם.");
}

const found = results.filter((r) => /^\d{7}$/.test(r.zip)).length;
console.log(`\nמיקוד נמצא ב-${found} מתוך ${results.length} כתובות.\n`);
process.exit(0);
