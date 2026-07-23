/**
 * הפקת טופס 101 הרשמי בתוך הדפדפן.
 *
 * הטופס הריק הוא PDF שטוח, ולכן המילוי הוא הטבעת טקסט בקואורדינטות מדויקות.
 * הקואורדינטות מגיעות מ-form101-map.json, שנוצר מהטופס עצמו — אותו מקור
 * שמשמש את הסקריפט בפייתון, כדי ששניהם לא יזוזו זה מזה.
 *
 * המודול נטען רק כשמגיעים למסך הסיום (import דינמי), כדי לא להכביד על השאלון.
 */
import MAP from "./form101-map.json";

const EMPLOYER = {
  name: 'שאול בטיש הלוי שאול תמרוקים בע"מ',
  address: "בר אילן 9 ירושלים",
  phone: "025402552",
  taxId: "941784761",
};

const INK = [0.05, 0.05, 0.25];

/* ---------- עברית ----------
   pdf-lib מצייר משמאל לימין בלבד, ולכן מוסרים לו את הטקסט בסדר חזותי:
   הופכים את המחרוזת, ומחזירים לכיוונם רצפים של ספרות ואותיות לטיניות. */
function toVisual(s) {
  return String(s);
}

function digitsOf(v) {
  return String(v ?? "").replace(/\D/g, "");
}
function dmy(iso) {
  if (!iso || !String(iso).includes("-")) return "";
  const [y, m, d] = String(iso).split("-");
  return `${d}${m}${y}`;
}
function dmySlash(iso) {
  const s = dmy(iso);
  return s ? `${s.slice(0, 2)}/${s.slice(2, 4)}/${s.slice(4)}` : "";
}

function kidCounts(kids, inCustody, taxYear) {
  const out = { born: 0, upTo2: 0, three: 0, f4to5: 0, s6to17: 0, e18: 0 };
  for (const k of kids || []) {
    if ((k.custody === "yes") !== !!inCustody) continue;
    const birth = String(k.birth || "");
    if (!birth.includes("-")) continue;
    const age = Number(taxYear) - Number(birth.split("-")[0]);
    if (age === 0) out.born++;
    else if (age <= 2) out.upTo2++;
    else if (age === 3) out.three++;
    else if (age <= 5) out.f4to5++;
    else if (age <= 17) out.s6to17++;
    else if (age === 18) out.e18++;
  }
  return out;
}

const PAY_BOX = {
  "משכורת חודש": "pay_monthly",
  "משכורת בעד משרה נוספת": "pay_extra_job",
  "משכורת חלקית": "pay_partial",
  "שכר עבודה (עובד יומי)": "pay_daily",
  "קצבה": "pay_pension",
  "מלגה": "pay_grant",
};
const OTHER_BOX = {
  "משכורת חודש": "other_monthly",
  "משכורת בעד משרה נוספת": "other_extra_job",
  "משכורת חלקית": "other_partial",
  "שכר עבודה (עובד יומי)": "other_daily",
  "קצבה": "other_pension",
  "מלגה": "other_grant",
};
const DATE_KEYS = new Set(["3_since", "4_aliya", "4_noIncomeUntil", "14_from", "14_to"]);

export async function buildForm101(answers, taxYear = String(new Date().getFullYear())) {
  const [{ PDFDocument, rgb }, fontkitMod, blankUrl, fontUrl] = await Promise.all([
    import("pdf-lib"),
    import("@pdf-lib/fontkit"),
    import("./assets/tofes-101.pdf?url").then((m) => m.default),
    import("./assets/heb.ttf?url").then((m) => m.default),
  ]);
  const fontkit = fontkitMod.default || fontkitMod;

  const [blankBytes, fontBytes] = await Promise.all([
    fetch(blankUrl).then((r) => r.arrayBuffer()),
    fetch(fontUrl).then((r) => r.arrayBuffer()),
  ]);

  const doc = await PDFDocument.load(blankBytes);
  doc.registerFontkit(fontkit);
  const font = await doc.embedFont(fontBytes, { subset: true });
  const pages = doc.getPages();
  const colour = rgb(...INK);

  const H = (page) => page.getSize().height;
  const draw = (pageNo, x, baseline, text, size) => {
    const page = pages[pageNo - 1];
    page.drawText(text, { x, y: H(page) - baseline, size, font, color: colour });
  };

  /** טקסט מיושר לימין, מתכווץ אם השדה צר */
  function textAt(pageNo, xRight, baseline, value, size = 10, width = 200) {
    if (value === undefined || value === null || value === "") return;
    const visual = toVisual(value);
    let s = size;
    while (s > 5 && font.widthOfTextAtSize(visual, s) > width) s -= 0.5;
    draw(pageNo, xRight - font.widthOfTextAtSize(visual, s), baseline, visual, s);
  }

  function text(key, value) {
    const t = MAP.text[key];
    if (!t) return;
    textAt(t.page, t.xRight, t.baseline, value, t.size, MAP.width[key] ?? 200);
  }

  /** טקסט ארוך נשבר לשורות בתוך רוחב התיבה */
  function textBlock(pageNo, xRight, firstBaseline, value, size, width, leading) {
    if (!value) return;
    const lines = [];
    let cur = "";
    for (const w of String(value).split(/\s+/)) {
      const trial = (cur ? cur + " " + w : w);
      if (!cur || font.widthOfTextAtSize(toVisual(trial), size) <= width) cur = trial;
      else { lines.push(cur); cur = w; }
    }
    if (cur) lines.push(cur);
    lines.slice(0, 3).forEach((line, i) => {
      textAt(pageNo, xRight, firstBaseline + i * leading, line, size, width + 40);
    });
  }

  function digitsAt(pageNo, x0, pitch, baseline, value, count, size) {
    const s = digitsOf(value).slice(0, count);
    for (let i = 0; i < s.length; i++) {
      draw(pageNo, x0 + i * pitch - size * 0.28, baseline - 3, s[i], size);
    }
  }

  function comb(key, value) {
    const c = MAP.comb[key];
    if (!c) return;
    digitsAt(c.page, c.x0, c.pitch, c.baseline, value, c.count, c.size);
  }

  function tick(key, size = 10) {
    const b = MAP.box[key];
    if (!b) return;
    // סימן וי מצויר בקווים, כדי לא להיות תלויים בגופן סמלים
    const page = pages[b.page - 1];
    const y = H(page) - (b.y + 8);
    const s = size * 0.62;
    page.drawLine({
      start: { x: b.x + 1.2, y: y + s * 0.45 },
      end: { x: b.x + s * 0.5, y },
      thickness: 1.15, color: colour,
    });
    page.drawLine({
      start: { x: b.x + s * 0.5, y },
      end: { x: b.x + s * 1.15, y: y + s * 1.1 },
      thickness: 1.15, color: colour,
    });
  }

  const a = answers || {};

  /* ---------- חלק א' : המעסיק ---------- */
  textBlock(1, 536, 170, EMPLOYER.name, 9, 100, 11);
  text("employer_address", EMPLOYER.address);
  text("employer_phone", EMPLOYER.phone);
  // הספרה 9 מודפסת בטופס בגודל 18 מול השאר — מכסים ומדפיסים אחיד
  pages[0].drawRectangle({
    x: 29.5, y: H(pages[0]) - 187, width: 11, height: 23,
    color: rgb(1, 1, 1),
  });
  comb("employerTaxId", EMPLOYER.taxId);
  comb("taxYear", taxYear);

  /* ---------- חלק ב' : העובד ---------- */
  comb("idNum", a.idNum);
  text("lastName", a.lastName);
  text("firstName", a.firstName);
  comb("birthDate", dmy(a.birthDate));
  if (a.bornIsrael === "no") comb("aliyaDate", dmy(a.aliyaDate));
  text("street", a.street);
  text("houseNo", a.houseNo);
  text("city", a.city);
  comb("zip", a.zip);
  text("mobile", a.mobile);
  text("phone", a.phone);
  text("email", a.email);

  tick(a.gender === "f" ? "gender_f" : "gender_m");
  tick({ single: "marital_single", married: "marital_married", divorced: "marital_divorced",
         widowed: "marital_widowed", separated: "marital_separated" }[a.marital]);
  tick(a.resident === "yes" ? "resident_yes" : "resident_no");
  tick({ no: "kibbutz_no", transferred: "kibbutz_transferred",
         not_transferred: "kibbutz_not_trans" }[a.kibbutz]);
  if (a.hmo && a.hmo !== "none") { tick("hmo_yes"); text("hmoName", a.hmo); }
  else tick("hmo_no");

  /* ---------- חלק ג' : ילדים ---------- */
  (a.kids || []).slice(0, 12).forEach((kid, i) => {
    const base = MAP.kidsFirstBaseline + i * MAP.kidsRowH;
    digitsAt(1, MAP.kids.birth_x0, MAP.kids.birth_pitch, base, dmy(kid.birth), 8, 9);
    digitsAt(1, MAP.kids.id_x0, MAP.kids.id_pitch, base, kid.id, 9, 9);
    textAt(1, MAP.kids.name_right, base, kid.name, 9, 70);
    if (kid.custody === "yes") tick2(MAP.kids.col1_x, base - 2.5);
    if (kid.allowance === "yes") tick2(MAP.kids.col2_x, base - 2.5);
  });
  function tick2(x, baseline) {
    const page = pages[0];
    const y = H(page) - baseline;
    page.drawLine({ start: { x: x + 1, y: y + 2.6 }, end: { x: x + 3, y }, thickness: 1.1, color: colour });
    page.drawLine({ start: { x: x + 3, y }, end: { x: x + 7, y: y + 6 }, thickness: 1.1, color: colour });
  }

  /* ---------- חלק ד' ---------- */
  tick(PAY_BOX[a.payType]);
  comb("startDate", dmy(a.startDate));

  /* ---------- חלק ה' ---------- */
  if (a.otherIncome === "yes") {
    tick("other_yes");
    (a.otherKinds || []).forEach((k) => tick(OTHER_BOX[k]));
    tick(a.creditChoice === "here" ? "credit_here" : "credit_other");
    if (a.decl9) tick("decl9");
    if (a.decl10) tick("decl10");
  } else {
    tick("other_none");
  }

  /* ---------- חלק ו' ---------- */
  if (a.marital === "married") {
    comb("spouseId", a.spouseId);
    text("spouseLastName", a.spouseLast);
    text("spouseFirstName", a.spouseFirst);
    comb("spouseBirth", dmy(a.spouseBirth));
    comb("spouseAliya", dmy(a.spouseAliya));
    if (a.spouseIncome === "none") tick("spouse_no_income");
    else if (a.spouseIncome) {
      tick("spouse_has_income");
      tick(a.spouseIncome === "other" ? "spouse_other" : "spouse_work_pension");
    }
  }

  /* ---------- עמוד 2 : חלק ח' ---------- */
  text("idNumPage2", a.idNum);
  const p8 = a.p8 || {};
  const p8f = a.p8f || {};
  Object.keys(p8).forEach((n) => { if (p8[n]) tick("p8_" + n, 12); });

  for (const [key, spot] of Object.entries(MAP.p8Fields)) {
    const clause = key.split("_")[0];
    if (!p8[clause]) continue;
    const raw = p8f[key];
    if (raw === undefined || raw === null || raw === "") continue;
    const value = DATE_KEYS.has(key) ? dmySlash(raw) : String(raw);
    if (spot.align === "c") {
      const w = font.widthOfTextAtSize(toVisual(value), 10);
      textAt(2, spot.x + w / 2, spot.baseline, value, 10, 60);
    } else {
      textAt(2, spot.x, spot.baseline, value, 10, 110);
    }
  }

  for (const [clause, spots] of Object.entries(MAP.kidCounts)) {
    if (!p8[clause]) continue;
    const counts = kidCounts(a.kids, clause === "7", taxYear);
    for (const [bucket, [x, baseline]] of Object.entries(spots)) {
      const n = counts[bucket];
      if (!n) continue;
      const w = font.widthOfTextAtSize(String(n), 10);
      textAt(2, x + w / 2, baseline, String(n), 10, 40);
    }
  }

  /* ---------- חלק ט' ---------- */
  if (a.taxCoord === "yes") {
    tick({ noIncome: "coord_no_income", multi: "coord_multi",
           approved: "coord_approved" }[a.taxReason], 12);
  }

  /* ---------- חלק י' : חתימה ---------- */
  if (a.signature && String(a.signature).includes(",")) {
    try {
      const png = await doc.embedPng(a.signature);
      const [x0, y0, x1, y1] = MAP.signatureRect;
      const boxW = x1 - x0, boxH = y1 - y0;
      const scale = Math.min(boxW / png.width, boxH / png.height);
      const w = png.width * scale, h = png.height * scale;
      pages[1].drawImage(png, {
        x: x0 + (boxW - w) / 2,
        y: H(pages[1]) - y1 + (boxH - h) / 2,
        width: w, height: h,
      });
    } catch { /* חתימה פגומה — מדלגים */ }
  }
  if (a.signDate) text("sign_date", dmySlash(a.signDate));

  return doc.save();
}

export async function form101Blob(answers, taxYear) {
  const bytes = await buildForm101(answers, taxYear);
  return new Blob([bytes], { type: "application/pdf" });
}
