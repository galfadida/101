/**
 * מסמך פנסיה נפרד — מכתב לחברה המנהלת את החיסכון הפנסיוני,
 * לצורך עדכון פרטי המעסיק החדש והמשך ההפקדות לקופה הקיימת.
 *
 * מסמך זה אינו חלק מטופס 101 — הוא מופק ומורד בנפרד.
 * מבוסס על אותם primitives של pdf.js (pdf-lib + הגופן העברי המצומצם),
 * שמרנדרים עברית בסדר לוגי בצורה נכונה.
 */

const EMPLOYER_NAME = 'שאול בטיש הלוי שאול תמרוקים בע"מ';
const EMPLOYER_CP = "515384402";                 // ח.פ
const INK = [0.05, 0.05, 0.25];
const PAGE_W = 595.28, PAGE_H = 841.89;           // A4
const RIGHT = 545, LEFT = 52;                      // שוליים
const WIDTH = RIGHT - LEFT;

function todayDmy() {
  const t = new Date();
  const p = (n) => String(n).padStart(2, "0");
  return `${p(t.getDate())}/${p(t.getMonth() + 1)}/${t.getFullYear()}`;
}

// ---- תיקון BiDi ----
// fontkit מרנדר עברית נכון אך הופך רצפי LTR (ספרות, לטינית, אחוזים, סוגריים).
// לכן מהפכים מראש כל רצף LTR וממשקפים סוגריים — כך שאחרי ההיפוך של fontkit
// הם יופיעו בכיוון הנכון. העברית נשארת כמות שהיא.
function toVisual(str) {
  const isLTR = (c) => /[0-9A-Za-z.,:/%+\-()"'₪]/.test(c);
  const mirror = (c) => (c === "(" ? ")" : c === ")" ? "(" : c);
  const out = String(str).split("");
  let i = 0;
  while (i < out.length) {
    if (isLTR(out[i])) {
      let j = i;
      while (j < out.length && isLTR(out[j])) j++;
      const seg = out.slice(i, j).reverse().map(mirror);
      for (let k = i; k < j; k++) out[k] = seg[k - i];
      i = j;
    } else i++;
  }
  return out.join("");
}

/**
 * @param {{firstName,lastName,idNum,taxFile}} info
 */
export async function pensionLetterBlob(info) {
  const [{ PDFDocument, rgb }, fontkitMod, fontUrl] = await Promise.all([
    import("pdf-lib"),
    import("@pdf-lib/fontkit"),
    import("./assets/heb.ttf?url").then((m) => m.default),
  ]);
  const fontkit = fontkitMod.default || fontkitMod;
  const fontBytes = await fetch(fontUrl).then((r) => r.arrayBuffer());

  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  const font = await doc.embedFont(fontBytes, { subset: true });
  const page = doc.addPage([PAGE_W, PAGE_H]);
  const colour = rgb(...INK);

  let y = 44; // מרחק מהראש; גדל כלפי מטה
  const lineH = 20;

  // לוגו שאול תמרוקים בראש המסמך, ממורכז
  try {
    const { LOGO } = await import("./logo.js");
    const png = await doc.embedPng(LOGO);
    const lw = 96, lh = lw * (png.height / png.width);
    page.drawImage(png, { x: (PAGE_W - lw) / 2, y: PAGE_H - y - lh, width: lw, height: lh });
    y += lh + 22;
  } catch (e) { y = 70; }

  function put(text, size, bold) {
    // רוחב זהה בין לוגי לחזותי (אותם תווים), לכן מודדים על המקור
    const w = font.widthOfTextAtSize(text, size);
    const vis = toVisual(text);
    page.drawText(vis, { x: RIGHT - w, y: PAGE_H - y, size, font, color: colour });
    // אין גופן מודגש נפרד — מדמים בולד ע"י ציור נוסף בהיסט זעיר
    if (bold) page.drawText(vis, { x: RIGHT - w + 0.4, y: PAGE_H - y, size, font, color: colour });
  }
  function drawRight(text, size, gap, bold) {
    if (gap) y += gap;
    put(text, size, bold);
    y += lineH;
  }
  // טקסט ארוך — שבירה לשורות מיושרות לימין
  function drawWrapped(text, size, gap) {
    if (gap) y += gap;
    const words = String(text).split(/\s+/);
    let cur = "";
    for (const word of words) {
      const trial = cur ? cur + " " + word : word;
      if (!cur || font.widthOfTextAtSize(trial, size) <= WIDTH) cur = trial;
      else { put(cur, size); y += lineH; cur = word; }
    }
    if (cur) { put(cur, size); y += lineH; }
  }

  const name = ((info.firstName || "") + " " + (info.lastName || "")).trim();

  // פרטי הלקוח בראש המסמך
  drawRight("פרטי הלקוח:", 11, 0, true);
  drawRight("שם: " + name, 11, 2);
  drawRight("תעודת זהות: " + (info.idNum || ""), 11);

  drawRight("לכבוד: החברה המנהלת את החיסכון הפנסיוני", 13, 16);
  drawRight("הנדון: עדכון פרטי מעסיק לצורך המשך הפקדות פנסיוניות", 12, 6);
  drawRight("שלום רב,", 11, 10);
  drawWrapped("אני מבקש/ת לעדכן את פרטי המעסיק החדש שלי לצורך המשך ביצוע ההפקדות לחיסכון הפנסיוני הקיים שלי.", 11, 8);

  drawRight("להלן פרטי המעסיק:", 11, 10, true);
  drawWrapped("שם המעסיק: " + EMPLOYER_NAME, 11, 2);
  drawRight("ח.פ.: " + EMPLOYER_CP, 11);
  drawRight("תיק ניכויים: " + (info.taxFile || ""), 11);

  drawRight("שיעורי ההפקדה:", 11, 10);
  drawRight("תגמולי עובד: 6%", 11);
  drawRight("תגמולי מעסיק: 6.5%", 11);
  drawRight("פיצויי מעסיק: 6%", 11);

  drawRight('שכר מבוטח: 6,000 ש"ח', 11, 10);

  drawWrapped("אבקש לעדכן את פרטי המעסיק במערכת ולהמשיך את ההפקדות לקופה הקיימת בהתאם לפרטים המפורטים לעיל.", 11, 12);

  if (info.mobile) drawRight("לפרטים ושאלות נוספות ניתן לפנות אליי בטלפון: " + info.mobile, 11, 12);

  drawRight("בברכה,", 11, 16);
  drawRight(name, 11, 2);
  drawRight("תאריך: " + todayDmy(), 11);

  const bytes = await doc.save();
  return new Blob([bytes], { type: "application/pdf" });
}
