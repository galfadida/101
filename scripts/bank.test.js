/**
 * בדיקות אלגוריתמי חוקיות חשבון בנק — מול הדוגמאות המתועדות במסמך מס"ב.
 * הרצה:  node --test scripts/bank.test.js
 *
 * כל assert כאן משחזר במדויק את סכום/תוצאת הדוגמה שבמסמך. בנק שאין לו
 * בדיקה כאן — מוגדר כ"פורמט בלבד" ב-bank.js (ללא ספרת ביקורת).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { validate, __test, bankByCode, BANKS } from "../src/bank.js";

const sum = __test.sum;

/* ---------- שחזור סכומי הדוגמאות מהמסמך ---------- */

test("בנק לאומי (10) — סכום 310 והמועמדים 60/50/10/62", () => {
  assert.equal(__test.sum("10", "696870", "639"), 310);
  assert.deepEqual(__test.leumiCandidates("696870", "639"), [60, 50, 10, 62]);
});

test("בנק הפועלים (12) — סכום 143, שארית 0", () => {
  assert.equal(sum("12", "611140", "175"), 143);
  assert.ok(validate("12", "175", "611140").ok); // שארית 0 חוקית
});

test("בנק יהב (04) — סכום 154, שארית 0", () => {
  assert.equal(sum("04", "760050", "482"), 154);
  assert.ok(validate("04", "482", "760050").ok);
});

test("קבוצת דיסקונט (11/17) — סכום 33, שארית 0", () => {
  assert.equal(sum("11", "810230000", ""), 33);
  assert.equal(sum("17", "810230000", ""), 33);
  assert.ok(validate("11", "", "810230000").ok);
});

test("בנק מזרחי טפחות (20) — סכום 121, סניף 406→006", () => {
  assert.equal(__test.mizrahiAdjust("406"), "6");
  assert.equal(sum("20", "160778", "406"), 121);
  assert.ok(validate("20", "406", "160778").ok);
});

test("קבוצת הבינלאומי (31/52) — סכום 33, שארית 0", () => {
  assert.equal(sum("31", "810230000", ""), 33);
  assert.equal(sum("52", "810230000", ""), 33);
  assert.ok(validate("31", "", "810230000").ok);
});

test("בנק אוצר החייל (14) — סכום 143, שארית 0 (סניף רגיל)", () => {
  assert.equal(sum("14", "611140", "175"), 143);
  assert.ok(validate("14", "175", "611140").ok);
});

test("בנק מסד (46) — סכום 143, שארית 0", () => {
  assert.equal(sum("46", "611140", "175"), 143);
  assert.ok(validate("46", "175", "611140").ok);
});

test("בנק הדואר (09) — סכום 150, מודולו 10 שארית 0", () => {
  assert.equal(sum("09", "009121950", ""), 150);
  assert.ok(validate("09", "", "009121950").ok);
});

test("בנק אש (03) — 224765234 תקין (187), 124765234 שגוי (186)", () => {
  assert.equal(sum("03", "224765234", ""), 187);
  assert.equal(sum("03", "124765234", ""), 186);
  assert.ok(validate("03", "", "224765234").ok);
  assert.equal(validate("03", "", "124765234").ok, false);
});

test("מקס איט (06) — 22345678 → ספרת ביקורת 2", () => {
  assert.equal(sum("06", "223456782", "001"), 242);
  assert.ok(validate("06", "001", "223456782").ok);          // גוף 22345678 + ביקורת 2
  assert.equal(validate("06", "001", "223456783").ok, false); // ביקורת שגויה
});

test("בנק איגוד (13) — בסיס 168, סה\"כ 190, שתי ספרות 90", () => {
  assert.equal(sum("13", "22001711", "706"), 190);
  assert.ok(validate("13", "706", "22001711").ok);
});

test("וואן זירו (18) — MOD97: חשבון 123456771 בסניף 001", () => {
  assert.ok(validate("18", "001", "123456771").ok);           // ביקורת 71
  assert.equal(validate("18", "001", "123456772").ok, false); // ביקורת שגויה
});

/* ---------- בנקים ללא ספרת ביקורת (פורמט בלבד) ---------- */

test("בנקים ללא חוקיות מתועדת אינם מזהירים לעולם", () => {
  for (const code of ["54", "26", "22", "23", "39"]) {
    assert.deepEqual(validate(code, "123", "123456789"), { ok: true });
  }
});

/* ---------- שלמות הרשימה ---------- */

test("רשימת הבנקים תקינה — 21 בנקים, לאומי ראשון", () => {
  assert.equal(BANKS.length, 21);
  assert.equal(BANKS[0].code, "10");
  assert.equal(bankByCode("4").code, "04"); // נורמליזציה של קוד חד-ספרתי
});

test("אזהרה רכה בלבד — אף בדיקה אינה חוסמת (אין ok:false בלי warn)", () => {
  const bad = validate("12", "175", "711140"); // 144 → שארית 1, לא חוקית
  assert.equal(bad.ok, false);
  assert.equal(typeof bad.warn, "string");
});
