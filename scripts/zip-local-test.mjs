/**
 * בדיקת השלמת המיקוד מול השרת המקומי (npm run dev), בלי פריסה.
 * דורש שכתובת http://localhost:5173/* תהיה ברשימת ההגבלות של מפתח ה-API.
 *
 *   node scripts/zip-local-test.mjs
 */
import puppeteer from "puppeteer";

const SITE = "http://localhost:5173/?dev";
const CASES = [
  { city: "ירושלים", street: "בר אילן", house: "9" },
  { city: "ירושלים", street: "הנשיא השישי", house: "16" },
  { city: "בית שמש", street: "נחל שורק", house: "12" },
  { city: "תל אביב - יפו", street: "רוטשילד", house: "45" },
  { city: "רמת גן", street: "הרצל", house: "20" },
  { city: "אלעד", street: "רבי עקיבא", house: "3" },
];

const browser = await puppeteer.launch({ headless: "new" });
const page = await browser.newPage();
await page.setViewport({ width: 420, height: 900, isMobile: true, hasTouch: true });
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
page.on("console", (m) => { if (m.type() === "error" || m.type() === "warning") errors.push("console: " + m.text().slice(0, 200)); });
page.on("response", (r) => { if (r.url().includes("maps.googleapis")) console.log("   [maps]", r.status(), r.url().split("?")[0].slice(0, 90)); });

await page.goto(SITE, { waitUntil: "networkidle2", timeout: 30000 });
await page.evaluate(() => localStorage.clear());
await page.reload({ waitUntil: "networkidle2" });

const heading = () => page.evaluate(() => document.querySelector("h1.q")?.textContent || "");
const next = async () => {
  await page.evaluate(() => document.querySelector("main .nav .btn-primary")?.click());
  await new Promise((r) => setTimeout(r, 400));
};

await page.evaluate(() => document.querySelector("main .btn-primary")?.click());
await new Promise((r) => setTimeout(r, 400));

for (let i = 0; i < 12; i++) {
  const h = await heading();
  if (h.includes("גרה") || h.includes("גר?")) break;
  const picked = await page.evaluate(() => {
    const box = document.querySelector(".choices");
    if (!box || box.querySelector('[aria-checked="true"]')) return false;
    box.children[0].click();
    return true;
  });
  if (picked) { await new Promise((r) => setTimeout(r, 400)); continue; }
  await page.evaluate(() => {
    document.querySelectorAll("main input").forEach((inp) => {
      if (inp.value) return;
      const set = (v) => { inp.value = v; inp.dispatchEvent(new Event("input", { bubbles: true })); };
      if (inp.classList.contains("date-in")) set("14051990");
      else if (inp.maxLength === 9) set("301138541");
      else set("בדיקה");
    });
  });
  await next();
}

console.log("\nמסך:", await heading(), "\n");

const type = async (key, value) => {
  const sel = `[data-key="${key}"] input`;
  await page.click(sel, { clickCount: 3 });
  await page.keyboard.press("Backspace");
  await page.type(sel, value, { delay: 20 });
};

let found = 0;
for (const c of CASES) {
  await page.evaluate(() => {
    ["city", "street", "houseNo", "zip"].forEach((k) => {
      const i = document.querySelector(`[data-key="${k}"] input`);
      if (i) { i.value = ""; i.dispatchEvent(new Event("input", { bubbles: true })); }
    });
  });
  await type("city", c.city);
  await page.evaluate(() => document.querySelector('[data-key="city"] .combo-item')?.click());
  await type("street", c.street);
  await page.evaluate(() => document.querySelector('[data-key="street"] .combo-item')?.click());
  await type("houseNo", c.house);

  let zip = "", hint = "";
  for (let t = 0; t < 40; t++) {
    await new Promise((r) => setTimeout(r, 400));
    ({ zip, hint } = await page.evaluate(() => ({
      zip: document.querySelector('[data-key="zip"] input')?.value || "",
      hint: document.querySelector('[data-key="zip"] .hint')?.textContent || "",
    })));
    if (/^\d{7}$/.test(zip) || hint.includes("לא הצלחנו")) break;
  }
  if (/^\d{7}$/.test(zip)) found++;
  const link = await page.evaluate(() =>
    document.querySelector('[data-key="zip"] .hint a')?.href || "");
  console.log(`${(c.street + " " + c.house + ", " + c.city).padEnd(30)} -> ${(zip || "(ריק)").padEnd(9)} ${hint}${link ? "  [" + link + "]" : ""}`);
}

// הזנה ידנית אחרי כישלון
await page.evaluate(() => {
  const i = document.querySelector('[data-key="zip"] input');
  i.value = "1234567";
  i.dispatchEvent(new Event("input", { bubbles: true }));
});
const manual = await page.evaluate(() => document.querySelector('[data-key="zip"] input').value);
console.log("\nהזנה ידנית עובדת:", manual === "1234567" ? "כן" : "לא (" + manual + ")");

// המשתמש הקליד ידנית — אין דריסה
await type("houseNo", "77");
await new Promise((r) => setTimeout(r, 3000));
const afterManual = await page.evaluate(() => document.querySelector('[data-key="zip"] input').value);
console.log("מיקוד ידני לא נדרס:", afterManual === "1234567" ? "כן" : "לא (" + afterManual + ")");

const cache = await page.evaluate(() => localStorage.getItem("zipcache_v1"));
console.log("\nקאש המיקודים:", cache);
console.log("\nשגיאות בעמוד:", errors.length ? "\n  " + errors.join("\n  ") : "אין");
console.log(`\nמיקוד נמצא ב-${found} מתוך ${CASES.length} כתובות.\n`);
await browser.close();
