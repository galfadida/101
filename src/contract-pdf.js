/**
 * הפקת חוזה העבודה החתום כ-PDF (רב-עמודי) בתוך הדפדפן.
 * מקור התוכן: contract-content.js (אותו מקור כמו התצוגה).
 * מבוסס על אותם primitives של pension-pdf: pdf-lib + הגופן העברי, תיקון BiDi.
 */
import { buildContractDoc } from "./contract-content.js";

const INK = [0.05, 0.05, 0.25];
const BRAND = [0.43, 0.18, 0.41];
const PAGE_W = 595.28, PAGE_H = 841.89;
const RIGHT = 545, LEFT = 52, WIDTH = RIGHT - LEFT;
const TOP = 56, BOTTOM = 60;

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

export async function contractPdfBlob(data) {
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
  const ink = rgb(...INK), brand = rgb(...BRAND);

  let page = doc.addPage([PAGE_W, PAGE_H]);
  let y = TOP;
  const lineH = 17;

  function newPage() { page = doc.addPage([PAGE_W, PAGE_H]); y = TOP; }
  function ensure(space) { if (y + space > PAGE_H - BOTTOM) newPage(); }

  function line(text, opts) {
    opts = opts || {};
    const size = opts.size || 10.5;
    const color = opts.color || ink;
    const w = font.widthOfTextAtSize(text, size);
    const x = opts.center ? (PAGE_W - w) / 2 : RIGHT - w;
    page.drawText(toVisual(text), { x, y: PAGE_H - y, size, font, color });
    if (opts.bold) page.drawText(toVisual(text), { x: x + 0.4, y: PAGE_H - y, size, font, color });
    y += (opts.lh || lineH);
  }
  function wrapped(text, opts) {
    opts = opts || {};
    const size = opts.size || 10.5;
    const words = String(text).split(/\s+/);
    let cur = "";
    for (const word of words) {
      const trial = cur ? cur + " " + word : word;
      if (!cur || font.widthOfTextAtSize(trial, size) <= WIDTH) cur = trial;
      else { ensure(lineH); line(cur, opts); cur = word; }
    }
    if (cur) { ensure(lineH); line(cur, opts); }
  }

  const cd = buildContractDoc(data);

  // לוגו
  try {
    const { LOGO } = await import("./logo.js");
    const png = await doc.embedPng(LOGO);
    const lw = 78, lh = lw * (png.height / png.width);
    page.drawImage(png, { x: (PAGE_W - lw) / 2, y: PAGE_H - y - lh, width: lw, height: lh });
    y += lh + 12;
  } catch (e) { /* בלי לוגו */ }

  line(cd.title, { size: 16, bold: true, center: true, color: brand, lh: 24 });

  cd.preamble.forEach((p) => { ensure(lineH); wrapped(p.t, { bold: !!p.strong }); });

  cd.sections.forEach((sec) => {
    ensure(lineH * 2);
    y += 6;
    line(sec.n + ". " + sec.title, { size: 12, bold: true, color: brand, lh: 19 });
    sec.items.forEach((it, i) => { ensure(lineH); wrapped(sec.n + "." + (i + 1) + "  " + it); });
  });

  ensure(lineH * 2);
  y += 8;
  wrapped(cd.closing, { bold: true });

  // בלוק חתימות
  ensure(90);
  y += 30;
  const colW = WIDTH / 2;
  // חתימת העובד (תמונה) בצד ימין
  if (data.signature && String(data.signature).includes(",")) {
    try {
      const sig = await doc.embedPng(data.signature);
      const sw = 120, sh = Math.min(46, sw * (sig.height / sig.width));
      page.drawImage(sig, { x: RIGHT - colW / 2 - sw / 2, y: PAGE_H - y - sh + 8, width: sw, height: sh });
    } catch (e) { /* חתימה פגומה */ }
  }
  y += 8;
  // קווי חתימה
  page.drawLine({ start: { x: LEFT + 20, y: PAGE_H - y }, end: { x: LEFT + colW - 20, y: PAGE_H - y }, thickness: 0.7, color: ink });
  page.drawLine({ start: { x: RIGHT - colW + 20, y: PAGE_H - y }, end: { x: RIGHT - 20, y: PAGE_H - y }, thickness: 0.7, color: ink });
  y += 15;
  const putc = (text, cx) => { const w = font.widthOfTextAtSize(text, 10.5); page.drawText(toVisual(text), { x: cx - w / 2, y: PAGE_H - y, size: 10.5, font, color: ink }); };
  putc("המעסיק", LEFT + colW / 2);
  putc("העובד", RIGHT - colW / 2);

  const bytes = await doc.save();
  return new Blob([bytes], { type: "application/pdf" });
}
