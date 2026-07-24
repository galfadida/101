# -*- coding: utf-8 -*-
"""
בונה מאגר סניפים לכל בנק מהקובץ הרשמי של בנק ישראל (Branches_for_payments.xml).
פלט: src/branches.js — { bankCode: [[branchCode, branchName, city], ...] } לסניפים פעילים.

  python scripts/build-branches.py
"""
import json, os, urllib.request, xml.etree.ElementTree as ET

URL = "https://www.boi.org.il/boi_files/Pikuah/Branches_for_payments.xml"
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "src", "branches.js")

req = urllib.request.Request(URL, headers={"User-Agent": "Mozilla/5.0"})
raw = urllib.request.urlopen(req, timeout=60).read()
# הקובץ UTF-8 עם BOM
text = raw.decode("utf-8-sig")
root = ET.fromstring(text)

def norm_code(c):
    c = "".join(ch for ch in (c or "") if ch.isdigit())
    return c

banks = {}
total = active = 0
for br in root.findall("branch"):
    total += 1
    close = (br.findtext("close_date") or "").strip()
    if close:            # סניף סגור — מדלגים
        continue
    bank = norm_code(br.findtext("id"))
    code = norm_code(br.findtext("branch_code"))
    name = (br.findtext("branch_name") or "").strip()
    city = (br.findtext("city") or "").strip()
    if not bank or not code:
        continue
    active += 1
    banks.setdefault(bank, {})[code] = [name, city]

# מסדרים לכל בנק לפי קוד סניף מספרי
out = {}
for bank, d in banks.items():
    rows = sorted(([c, v[0], v[1]] for c, v in d.items()), key=lambda r: int(r[0]))
    out[bank] = rows

blob = "export const BRANCHES_BY_BANK = " + json.dumps(out, ensure_ascii=False, separators=(",", ":")) + ";\n"
with open(OUT, "w", encoding="utf-8", newline="\n") as f:
    f.write(blob)

print("branches total:", total, "active:", active)
print("banks:", len(out))
for bank in sorted(out, key=lambda b: int(b)):
    print(f"  bank {bank}: {len(out[bank])} branches")
print("wrote", OUT, os.path.getsize(OUT) // 1024, "KB")
