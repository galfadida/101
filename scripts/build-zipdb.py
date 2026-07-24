# -*- coding: utf-8 -*-
"""
בונה מאגר מיקוד לחיפוש אוטומטי בצד-לקוח.

מקורות:
  1. קובץ המיקוד הפתוח (odata.org.il, snapshot ~2017-2020) — 3 קבצי XLSX:
       location.xlsx  LocationID | Location Symbol | Location Name | ... | ZIP7
       street.xlsx    Location ID | Location Symbol | Street Name | ... | Street ID | Street Symbol
       zip.xlsx       LocationID | House Number | Entrance | ZIP5 | ZIP7 | StreetID
  2. data.gov.il "רשימת רחובות בישראל" — כדי לתרגם סמלי למ"ס לשמות שהאפליקציה מציגה.

עיקרון החיבור (אמין, מספרי):
  Location Symbol (דואר) == סמל_ישוב (data.gov)   [אומת: ירושלים=3000, ב"ש=9000]
  Street  Symbol (דואר) == סמל_רחוב (data.gov)   [אומת: ביאליק=701, שד' רגר=811]

הפלט מפתחו בשמות data.gov (שם_ישוב|שם_רחוב) — בדיוק מה שהעובד בוחר מהרשימה —
כך שאין בעיות התאמת שמות בזמן ריצה.

פלט: public/zipdata.json  { cityZip:{normCity:zip7}, addr:{ "city|street":{house:zip7} } }

  python scripts/build-zipdb.py
"""
import json, os, io, re, urllib.request, urllib.parse
import openpyxl

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT  = os.path.join(ROOT, "public", "zipdata.json")
CACHE = os.path.join(ROOT, "scripts", ".zipcache")
os.makedirs(CACHE, exist_ok=True)
os.makedirs(os.path.dirname(OUT), exist_ok=True)

ODATA = {
    "location.xlsx": "https://www.odata.org.il/dataset/52dd54ae-65dd-4f35-9f57-95341e02fd85/resource/65b5335b-766f-4aec-9bb5-c1b1ed58f68b/download/location.xlsx",
    "street.xlsx":   "https://www.odata.org.il/dataset/52dd54ae-65dd-4f35-9f57-95341e02fd85/resource/068c856b-ca97-4035-8ba1-54e336d0c5c4/download/street.xlsx",
    "zip.xlsx":      "https://www.odata.org.il/file_uploader_ui/download/00a9749e-c112-4190-9c37-97918b5792cf/758dbb4c-fe40-4f9a-bc21-4c7cd4516d72.xlsx",
}
DG_STREETS_RID = "9ad3862c-8391-4b2f-84a4-2d4c68625f4b"  # data.gov.il רשימת רחובות (CSV datastore)

def fetch(url, dest, timeout=180):
    if os.path.exists(dest) and os.path.getsize(dest) > 1000:
        return dest
    print("  downloading", os.path.basename(dest), "...")
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    data = urllib.request.urlopen(req, timeout=timeout).read()
    with open(dest, "wb") as f:
        f.write(data)
    return dest

def sym(x):
    """מנרמל סמל למ"ס למספר שלם (מסיר אפסים מובילים)."""
    s = re.sub(r"\D", "", str(x or ""))
    return str(int(s)) if s else ""

def norm(s):
    if s is None: return ""
    s = str(s).strip()
    for ch in ("״", "׳", '"', "'"): s = s.replace(ch, "")
    s = s.replace("-", " ").replace(".", " ")
    s = re.sub(r"\s+", " ", s).strip()
    return s

def xrows(path):
    wb = openpyxl.load_workbook(path, read_only=True)
    ws = wb.active
    it = ws.iter_rows(values_only=True)
    next(it)
    for r in it:
        yield r
    wb.close()

# ---------- 1. data.gov.il רחובות: (citySym, streetSym) -> (cityName, streetName) ----------
print("data.gov.il streets…")
def _col(fields, name):
    for f in fields:
        if str(f).replace("﻿", "") == name: return f
    return name
def dg_all():
    recs = {}
    base = "https://data.gov.il/api/3/action/datastore_search"
    limit = 50000; offset = 0; total = None
    while True:
        url = f"{base}?resource_id={DG_STREETS_RID}&limit={limit}&offset={offset}"
        req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
        d = json.loads(urllib.request.urlopen(req, timeout=180).read().decode("utf-8"))["result"]
        fields = [f["id"] for f in d["fields"]]
        c_cs, c_cn = _col(fields, "סמל_ישוב"), _col(fields, "שם_ישוב")
        c_ss, c_sn = _col(fields, "סמל_רחוב"), _col(fields, "שם_רחוב")
        recs_page = d["records"]
        for rec in recs_page:
            cs = sym(rec.get(c_cs)); ss = sym(rec.get(c_ss))
            cn = str(rec.get(c_cn) or "").strip(); sn = str(rec.get(c_sn) or "").strip()
            if cs and ss and cn and sn:
                recs[(cs, ss)] = (cn, sn)
                recs.setdefault(("city", cs), cn)
        if total is None: total = d.get("total", 0)
        offset += limit
        print(f"  fetched {min(offset,total)}/{total}")
        if offset >= total or not recs_page:
            break
    return recs

dg = dg_all()
print("  data.gov pairs:", sum(1 for k in dg if k[0] != "city"))

# ---------- 2. דואר: LocationID -> LocationSymbol, city default zip ----------
print("israelpost location…")
loc_path = fetch(ODATA["location.xlsx"], os.path.join(CACHE, "location.xlsx"))
lid_to_csym = {}
city_zip = {}   # normCity(data.gov) -> zip7
for r in xrows(loc_path):
    lid, lsym, name, syn, ltype, z5, z7, upd = r
    lid = str(lid).strip(); cs = sym(lsym)
    if cs: lid_to_csym[lid] = cs
    if z7:
        z7 = str(z7).strip()
        if z7 and z7 != "0000000":
            cn = dg.get(("city", cs))
            if cn: city_zip[norm(cn)] = z7

# ---------- 3. דואר: StreetID -> (citySym, streetSym) ----------
print("israelpost street…")
st_path = fetch(ODATA["street.xlsx"], os.path.join(CACHE, "street.xlsx"))
sid_to_syms = {}   # מפתח: LocationID|StreetID  (StreetID אינו ייחודי גלובלית!)
for r in xrows(st_path):
    lid, lsym, sname, ssyn, sid, ssym, upd = r
    lid = str(lid).strip(); sid = str(sid).strip()
    cs = sym(lsym) or lid_to_csym.get(lid, "")
    ss = sym(ssym)
    if lid and sid and cs and ss:
        sid_to_syms[lid + "|" + sid] = (cs, ss)

# ---------- 4. דואר: zip -> שיטוח לפי שמות data.gov ----------
print("israelpost zip…")
zip_path = fetch(ODATA["zip.xlsx"], os.path.join(CACHE, "zip.xlsx"))
addr = {}
kept = 0; miss_sym = 0; miss_dg = 0
for r in xrows(zip_path):
    lid, house, entrance, z5, z7, sid, remark, upd = r
    if not z7: continue
    lid = str(lid).strip(); sid = str(sid).strip()
    syms = sid_to_syms.get(lid + "|" + sid)
    if not syms:
        # ניסיון גיבוי: סמל עיר מ-LocationID, אין סמל רחוב → דלג
        miss_sym += 1; continue
    names = dg.get(syms)
    if not names:
        miss_dg += 1; continue
    cn, sn = names
    try: h = str(int(str(house).strip()))
    except: continue
    key = norm(cn) + "|" + norm(sn)
    addr.setdefault(key, {})[h] = str(z7).strip()
    kept += 1

out = {"cityZip": city_zip, "addr": addr}
raw = json.dumps(out, ensure_ascii=False, separators=(",", ":"))
with io.open(OUT, "w", encoding="utf-8", newline="\n") as f:
    f.write(raw)

print("\ncity defaults :", len(city_zip))
print("street-keys   :", len(addr))
print("zip entries   :", kept, "(miss street-sym:", miss_sym, " miss data.gov:", miss_dg, ")")
print("json  MB      : %.2f" % (len(raw.encode("utf-8")) / 1e6))
print("wrote", OUT)
