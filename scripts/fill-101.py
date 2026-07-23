# -*- coding: utf-8 -*-
"""
הפקת טופס 101 ממולא מתוך תשובות השאלון.

  python scripts/fill-101.py answers.json out.pdf

answers.json הוא המבנה שנשמר ב-Firestore תחת
employees/{id}/form101/current  ->  { answers, taxYear }
"""
import base64, io, json, os, re, sys
import fitz
from form101_map import (TEXT, WIDTH, COMB, BOX, KIDS, KIDS_FIRST_BASELINE,
                         KIDS_ROW_H, SIGNATURE_RECT)

BLANK = os.environ.get("FORM_101_BLANK", r"C:\Users\גל\Desktop\tofes-101.pdf")
FONT_DIR = r"C:\Windows\Fonts"
FONT_FILE = "arial.ttf"
INK = (0.05, 0.05, 0.25)

EMPLOYER = {
    "name": 'שאול בטיש הלוי שאול תמרוקים בע"מ',
    "address": "בר אילן 9 ירושלים",
    "phone": "025402552",
    "taxId": "941784761",          # הספרה הראשונה מודפסת בטופס
}


def digits(v):
    return "".join(ch for ch in str(v or "") if ch.isdigit())


def dmy(iso):
    """1990-05-14 -> 14051990"""
    if not iso or "-" not in str(iso):
        return ""
    y, m, d = str(iso).split("-")[:3]
    return f"{d}{m}{y}"


class Form101:
    def __init__(self, blank=BLANK):
        self.doc = fitz.open(blank)
        self.font = fitz.Font(fontfile=os.path.join(FONT_DIR, FONT_FILE))

    def _page(self, n):
        return self.doc[n - 1]

    def text_at(self, page_no, x_right, baseline, value, size=10, width=200):
        """כותב טקסט מיושר לימין. מכווץ את הגופן אם השדה צר מדי."""
        if value in (None, ""):
            return
        value = str(value)
        page = self._page(page_no)
        while size > 5 and self.font.text_length(value, size) > width:
            size -= 0.5
        w = self.font.text_length(value, size)
        tw = fitz.TextWriter(page.rect, color=INK)
        tw.append((x_right - w, baseline), value, font=self.font,
                  fontsize=size, right_to_left=True)
        tw.write_text(page)

    def text(self, key, value):
        if key not in TEXT:
            return
        pg, x_right, baseline, size = TEXT[key]
        self.text_at(pg, x_right, baseline, value, size, WIDTH.get(key, 200))

    def comb(self, key, value):
        s = digits(value)
        if not s or key not in COMB:
            return
        pg, x0, pitch, baseline, count, size = COMB[key]
        page = self._page(pg)
        for i, ch in enumerate(s[:count]):
            page.insert_text((x0 + i * pitch - size * 0.28, baseline - 3), ch,
                             fontname="hebtt", fontfile=os.path.join(FONT_DIR, FONT_FILE),
                             fontsize=size, color=INK)

    def digits_at(self, page_no, x0, pitch, baseline, value, count, size=9):
        s = digits(value)
        if not s:
            return
        page = self._page(page_no)
        for i, ch in enumerate(s[:count]):
            page.insert_text((x0 + i * pitch - size * 0.28, baseline - 3), ch,
                             fontname="hebtt", fontfile=os.path.join(FONT_DIR, FONT_FILE),
                             fontsize=size, color=INK)

    def tick(self, key):
        if not key or key not in BOX:
            return
        pg, x, y = BOX[key]
        self._page(pg).insert_text((x + 0.7, y + 9.3), "4",
                                   fontname="ZaDb", fontsize=10, color=INK)

    def tick_at(self, page_no, x, y, size=9):
        self._page(page_no).insert_text((x, y), "4", fontname="ZaDb",
                                        fontsize=size, color=INK)

    # ---------- חלק ג' ----------
    def kid_row(self, idx, kid):
        if idx >= 12:
            return
        base = KIDS_FIRST_BASELINE + idx * KIDS_ROW_H
        self.digits_at(1, KIDS["birth_x0"], KIDS["birth_pitch"], base, dmy(kid.get("birth")), 8)
        self.digits_at(1, KIDS["id_x0"], KIDS["id_pitch"], base, kid.get("id"), 9)
        self.text_at(1, KIDS["name_right"], base, kid.get("name"), 9, width=70)
        if kid.get("custody") == "yes":
            self.tick_at(1, KIDS["col1_x"], base - 2.5)
        if kid.get("allowance") == "yes":
            self.tick_at(1, KIDS["col2_x"], base - 2.5)

    # ---------- חתימה ----------
    def signature(self, data_url):
        if not data_url or "," not in data_url:
            return
        try:
            raw = base64.b64decode(data_url.split(",", 1)[1])
        except Exception:
            return
        x0, y0, x1, y1 = SIGNATURE_RECT
        self._page(2).insert_image(fitz.Rect(x0, y0, x1, y1), stream=raw,
                                   keep_proportion=True, overlay=True)

    # ---------- הרכבה ----------
    def build(self, a, tax_year="2026"):
        # חלק א' — המעסיק
        self.text("employer_name", EMPLOYER["name"])
        self.text("employer_address", EMPLOYER["address"])
        self.text("employer_phone", EMPLOYER["phone"])
        self.comb("employerTaxId", EMPLOYER["taxId"][1:])
        self.comb("taxYear", tax_year)

        # חלק ב' — העובד
        self.comb("idNum", a.get("idNum"))
        self.text("lastName", a.get("lastName"))
        self.text("firstName", a.get("firstName"))
        self.comb("birthDate", dmy(a.get("birthDate")))
        if a.get("bornIsrael") == "no":
            self.comb("aliyaDate", dmy(a.get("aliyaDate")))
        self.text("street", a.get("street"))
        self.text("houseNo", a.get("houseNo"))
        self.text("city", a.get("city"))
        self.comb("zip", a.get("zip"))
        self.text("mobile", a.get("mobile"))
        self.text("phone", a.get("phone"))
        self.text("email", a.get("email"))

        self.tick("gender_f" if a.get("gender") == "f" else "gender_m")
        self.tick({"single": "marital_single", "married": "marital_married",
                   "divorced": "marital_divorced", "widowed": "marital_widowed",
                   "separated": "marital_separated"}.get(a.get("marital")))
        self.tick("resident_yes" if a.get("resident") == "yes" else "resident_no")
        self.tick({"no": "kibbutz_no", "transferred": "kibbutz_transferred",
                   "not_transferred": "kibbutz_not_trans"}.get(a.get("kibbutz")))
        if a.get("hmoMember") == "yes":
            self.tick("hmo_yes")
            self.text("hmoName", a.get("hmo"))
        else:
            self.tick("hmo_no")

        # חלק ג' — ילדים
        for i, kid in enumerate(a.get("kids") or []):
            self.kid_row(i, kid)

        # חלק ד' — ההכנסה ממעסיק זה
        self.tick({"משכורת חודש": "pay_monthly",
                   "משכורת בעד משרה נוספת": "pay_extra_job",
                   "משכורת חלקית": "pay_partial",
                   "שכר עבודה (עובד יומי)": "pay_daily",
                   "קצבה": "pay_pension",
                   "מלגה": "pay_grant"}.get(a.get("payType")))
        self.comb("startDate", dmy(a.get("startDate")))

        # חלק ה' — הכנסות אחרות
        if a.get("otherIncome") == "yes":
            self.tick("other_yes")
            for kind in a.get("otherKinds") or []:
                self.tick({"משכורת חודש": "other_monthly",
                           "משכורת בעד משרה נוספת": "other_extra_job",
                           "משכורת חלקית": "other_partial",
                           "שכר עבודה (עובד יומי)": "other_daily",
                           "קצבה": "other_pension",
                           "מלגה": "other_grant"}.get(kind))
            self.tick("credit_here" if a.get("creditChoice") == "here" else "credit_other")
            if a.get("decl9"):
                self.tick("decl9")
            if a.get("decl10"):
                self.tick("decl10")
        else:
            self.tick("other_none")

        # חלק ו' — בן/בת הזוג
        if a.get("marital") == "married":
            self.comb("spouseId", a.get("spouseId"))
            self.text("spouseLastName", a.get("spouseLast"))
            self.text("spouseFirstName", a.get("spouseFirst"))
            self.comb("spouseBirth", dmy(a.get("spouseBirth")))
            self.comb("spouseAliya", dmy(a.get("spouseAliya")))
            self.tick({"none": "spouse_no_income", "work": "spouse_work",
                       "pension": "spouse_pension", "other": "spouse_other"}.get(a.get("spouseIncome")))

        # עמוד 2 — חלק ח'
        self.text("idNumPage2", a.get("idNum"))
        for num, on in (a.get("p8") or {}).items():
            if on:
                self.tick("p8_" + str(num))

        # חלק ט' — תיאום מס
        if a.get("taxCoord") == "yes":
            self.tick({"noIncome": "coord_no_income", "multi": "coord_multi",
                       "approved": "coord_approved"}.get(a.get("taxReason")))

        # חלק י' — הצהרה וחתימה
        self.signature(a.get("signature"))
        sd = a.get("signDate")
        if sd:
            self.text("sign_date", dmy(sd)[:2] + "/" + dmy(sd)[2:4] + "/" + dmy(sd)[4:])

        return self.doc


def main():
    src = sys.argv[1]
    out = sys.argv[2] if len(sys.argv) > 2 else "tofes101-filled.pdf"
    payload = json.load(open(src, encoding="utf-8"))
    answers = payload.get("answers", payload)
    doc = Form101().build(answers, str(payload.get("taxYear", "2026")))
    doc.save(out)
    print("wrote", out)


if __name__ == "__main__":
    main()
