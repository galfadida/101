/* =========================================================
   בדיקת תקינות מספרי חשבון בנק — לפי מסמך מס"ב
   "בדיקות חוקיות מספרי חשבון" (בנק ישראל / מס"ב, מאי 2025).

   עקרון מוצר קריטי: מסמך מס"ב עצמו קובע שהבדיקה היוריסטית
   ומספר שנכשל "אינו בהכרח שגוי". לכן הבדיקה כאן היא אזהרה
   רכה ולא חוסמת בלבד — validate() לעולם אינו מונע המשך.

   כל אלגוריתם מקודד כך שהוא משחזר במדויק את דוגמת החישוב
   המתועדת במסמך (ראו scripts/bank.test.js). בנק שלא ניתן
   לאמת מול דוגמה מתועדת — בדיקת פורמט בלבד, ללא ספרת ביקורת.
   ========================================================= */

/* רשימת הבנקים הרשמית (בנק ישראל / data.gov.il) — הנפוצים ראשונים. */
export var BANKS = [
  { code: "10", name: "בנק לאומי" },
  { code: "12", name: "בנק הפועלים" },
  { code: "11", name: "בנק דיסקונט" },
  { code: "20", name: "בנק מזרחי טפחות" },
  { code: "31", name: "הבנק הבינלאומי הראשון" },
  { code: "14", name: "בנק אוצר החייל" },
  { code: "17", name: "בנק מרכנתיל דיסקונט" },
  { code: "04", name: "בנק יהב" },
  { code: "54", name: "בנק ירושלים" },
  { code: "46", name: "בנק מסד" },
  { code: "52", name: "בנק פאגי (פועלי אגודת ישראל)" },
  { code: "09", name: "בנק הדואר" },
  { code: "18", name: "וואן זירו הבנק הדיגיטלי" },
  { code: "26", name: "יו-בנק" },
  { code: "03", name: "בנק אש ישראל" },
  { code: "06", name: "מקס איט פיננסים" },
  { code: "22", name: "Citibank" },
  { code: "23", name: "HSBC" },
  { code: "39", name: "SBI (State Bank of India)" },
  { code: "13", name: "בנק איגוד" },
  { code: "34", name: "בנק ערבי ישראלי" }
];

export function bankByCode(code) {
  code = normCode(code);
  for (var i = 0; i < BANKS.length; i++) if (BANKS[i].code === code) return BANKS[i];
  return null;
}
export function bankLabel(code) {
  var b = bankByCode(code);
  return b ? b.code + " " + b.name : "";
}
export function bankFromLabel(label) {
  for (var i = 0; i < BANKS.length; i++) if (BANKS[i].code + " " + BANKS[i].name === label) return BANKS[i];
  return null;
}

var WARN = "מספר החשבון לא נראה תקין — כדאי לבדוק שוב מול פרטי הבנק";

/* ---------- עזרים ---------- */
function digits(v) { return String(v == null ? "" : v).replace(/\D/g, ""); }
function normCode(v) { var c = digits(v); return c.length === 1 ? "0" + c : c; }

// סכום משוקלל: המשקל weights[i] מוכפל בספרה במקום ה-i מימין (0 = יחידות).
function weightedFromRight(str, weights) {
  var d = digits(str), sum = 0, n = d.length;
  for (var i = 0; i < n && i < weights.length; i++) {
    sum += (+d[n - 1 - i]) * weights[i];
  }
  return sum;
}

/* ---------- משפחות אלגוריתמים ---------- */

// לוגיקת מודולו 11 עם משקלים לחשבון ולסניף ורשימת שאריות חוקיות.
function mkMod11(acctW, brW, remOf, adjustBranch) {
  return {
    sum: function (acc, br) {
      var b = adjustBranch ? adjustBranch(br) : br;
      return weightedFromRight(acc, acctW) + (brW ? weightedFromRight(b, brW) : 0);
    },
    check: function (acc, br) {
      var b = adjustBranch ? adjustBranch(br) : br;
      var s = weightedFromRight(acc, acctW) + (brW ? weightedFromRight(b, brW) : 0);
      return remOf(br).indexOf(s % 11) > -1;
    }
  };
}

function mizrahiAdjust(br) {
  var n = +digits(br);
  if (n >= 401 && n <= 799) return String(n - 400);
  return digits(br);
}

// בנק לאומי / ערבי ישראלי — סכום משוקלל + חמישה סוגי חשבון, מודולו 100.
function leumiBase(acc, br) {
  return weightedFromRight(acc, [7, 6, 5, 4, 3, 2]) + weightedFromRight(br, [10, 9, 8]);
}
function leumiCandidates(acc, br) {
  var base = leumiBase(acc, br);
  var d = digits(acc), n = d.length;
  // הספרות 5,6 (מימין) קובעות אם סוג 110 רלוונטי
  var p5 = n >= 5 ? +d[n - 5] : 0;
  var p6 = n >= 6 ? +d[n - 6] : 0;
  var d56 = p5 * 10 + p6;
  var types = [330, 340, 180, 128];
  if (d56 === 0 || d56 === 20 || d56 === 23) types.push(110);
  return types.map(function (t) {
    var m = (base + t) % 100;
    return m === 0 ? 0 : 100 - m;
  });
}
var LEUMI = {
  sum: leumiBase,
  check: function (acc, br) {
    var d = digits(acc);
    if (d.length < 2) return true;
    var pair = +d.slice(-2);
    return leumiCandidates(acc, br).indexOf(pair) > -1;
  }
};

// בנק איגוד — סכום משוקלל + הוספת שתי הספרות השמאליות כמספר, שתי ימניות בקבוצה.
function igudTotal(acc, br) {
  var d = digits(acc);
  var xh = d.length >= 2 ? +d.slice(0, 2) : 0;
  var six = d.slice(2);
  return weightedFromRight(six, [7, 6, 5, 4, 3, 2]) + weightedFromRight(br, [10, 9, 8]) + xh;
}
var IGUD = {
  sum: igudTotal,
  check: function (acc, br) {
    var last2 = igudTotal(acc, br) % 100;
    return [90, 72, 70, 60, 20, 0].indexOf(last2) > -1;
  }
};

// בנק הדואר — מודולו 10 ללא שארית.
var POSTAL = {
  sum: function (acc) { return weightedFromRight(acc, [9, 8, 7, 6, 5, 4, 3, 2, 1]); },
  check: function (acc) { return weightedFromRight(acc, [9, 8, 7, 6, 5, 4, 3, 2, 1]) % 10 === 0; }
};

// בנק אש — סכום משוקלל של כל הספרות מתחלק ב-11.
var ESH = {
  sum: function (acc) { return weightedFromRight(acc, [2, 3, 4, 5, 6, 7, 8, 9, 1]); },
  check: function (acc) { return weightedFromRight(acc, [2, 3, 4, 5, 6, 7, 8, 9, 1]) % 11 === 0; }
};

// מקס איט — ספרת ביקורת (יחידות) = מודולו 10 של גוף החשבון.
var MAX = {
  sum: function (acc) { return weightedFromRight(digits(acc).slice(0, -1), [9, 8, 7, 6, 5, 4, 3, 2]); },
  check: function (acc) {
    var d = digits(acc);
    if (d.length < 2) return true;
    var body = d.slice(0, -1), chk = +d.slice(-1);
    return weightedFromRight(body, [9, 8, 7, 6, 5, 4, 3, 2]) % 10 === chk;
  }
};

// וואן זירו — MOD97: (סניף ללא אפסים מובילים ומספר החשבון) → 98 פחות השארית.
var ONEZERO = {
  check: function (acc, br) {
    var d = digits(acc);
    if (d.length < 3) return true;
    var body = d.slice(0, -2), chk = +d.slice(-2);
    var brStr = String(+digits(br));           // הסרת אפסים מובילים
    var n = Number(brStr + body);
    if (!isFinite(n) || n > Number.MAX_SAFE_INTEGER) return true;
    return 98 - (n % 97) === chk;
  }
};

/* ---------- קבוצת הבינלאומי (31/52) — כולל שלב ב' וברירת אוצר החייל ---------- */
var OTSAR_REM = function (br) {
  br = digits(br);
  if (["361", "362", "363"].indexOf(br) > -1) return [0, 2, 4];
  if (["347", "365", "384", "385"].indexOf(br) > -1) return [0, 2];
  return [0];
};
var OTSAR = mkMod11([6, 5, 4, 3, 2, 1], [9, 8, 7], OTSAR_REM);

var BEINLEUMI = {
  sum: function (acc) { return weightedFromRight(acc, [9, 8, 7, 6, 5, 4, 3, 2, 1]); },
  check: function (acc, br) {
    var stageA = weightedFromRight(acc, [9, 8, 7, 6, 5, 4, 3, 2, 1]) % 11;
    if (stageA === 0 || stageA === 6) return true;
    // שלב ב' — אותה בדיקה על שש הספרות הימניות בלבד (מקל, מפחית אזהרות שווא)
    var six = digits(acc).slice(-6);
    var stageB = weightedFromRight(six, [9, 8, 7, 6, 5, 4, 3, 2, 1]) % 11;
    if (stageB === 0 || stageB === 6) return true;
    return false;
  }
};

/* ---------- טבלת ההגדרות לפי קוד בנק ---------- */
var CFG = {
  "10": { fam: LEUMI, min: 4 },                                             // לאומי
  "34": { fam: LEUMI, min: 4 },                                             // ערבי ישראלי (קבוצת לאומי)
  "12": { fam: mkMod11([6, 5, 4, 3, 2, 1], [9, 8, 7], function () { return [0, 2, 4, 6]; }), min: 3 }, // הפועלים
  "04": { fam: mkMod11([6, 5, 4, 3, 2, 1], [9, 8, 7], function () { return [0, 2]; }), min: 3 },       // יהב
  "11": { fam: mkMod11([9, 8, 7, 6, 5, 4, 3, 2, 1], null, function () { return [0, 2, 4]; }), min: 4 }, // דיסקונט
  "17": { fam: mkMod11([9, 8, 7, 6, 5, 4, 3, 2, 1], null, function () { return [0, 2, 4]; }), min: 4 }, // מרכנתיל דיסקונט
  "20": { fam: mkMod11([1, 2, 3, 4, 5, 6], [7, 8, 9], function () { return [0, 2, 4]; }, mizrahiAdjust), min: 4 }, // מזרחי טפחות
  "31": { fam: BEINLEUMI, min: 4 },                                         // הבינלאומי
  "52": { fam: BEINLEUMI, min: 4 },                                         // פאגי (קבוצת הבינלאומי)
  "14": { fam: OTSAR, min: 3 },                                             // אוצר החייל
  "46": { fam: mkMod11([6, 5, 4, 3, 2, 1], [9, 8, 7], function (br) {       // מסד
      var two = ["154","166","178","181","183","191","192","503","505","507","515","516","527","539"];
      return two.indexOf(digits(br)) > -1 ? [0, 2] : [0];
    }), min: 3 },
  "09": { fam: POSTAL, min: 4 },                                            // הדואר
  "18": { fam: ONEZERO, min: 4 },                                          // וואן זירו
  "03": { fam: ESH, min: 4 },                                              // אש ישראל
  "06": { fam: MAX, min: 4 },                                              // מקס איט
  "13": { fam: IGUD, min: 4 }                                             // איגוד
  // 54 ירושלים, 26 יו-בנק, 22 Citibank, 23 HSBC, 39 SBI — בדיקת פורמט בלבד
};

/**
 * validate — בדיקה רכה של מספר חשבון.
 * @returns {ok:true}                         תקין / לא ניתן לבדוק / בנק ללא חוקיות
 *          {ok:false, warn:string}           נראה שגוי (אזהרה בלבד — לא חוסם!)
 */
export function validate(code, branch, account) {
  code = normCode(code);
  var acc = digits(account), br = digits(branch);
  var cfg = CFG[code];
  if (!cfg) return { ok: true };                 // בדיקת פורמט בלבד
  if (acc.length < (cfg.min || 4)) return { ok: true }; // לא מזהירים בזמן הקלדה
  var ok;
  try { ok = cfg.fam.check(acc, br); } catch (e) { return { ok: true }; }
  return ok ? { ok: true } : { ok: false, warn: WARN };
}

/* ---------- ממשק פנימי לבדיקות (scripts/bank.test.js) ---------- */
export var __test = {
  weightedFromRight: weightedFromRight,
  sum: function (code, account, branch) {
    var cfg = CFG[normCode(code)];
    if (!cfg || !cfg.fam.sum) return null;
    return cfg.fam.sum(digits(account), digits(branch));
  },
  leumiCandidates: leumiCandidates,
  mizrahiAdjust: mizrahiAdjust
};
