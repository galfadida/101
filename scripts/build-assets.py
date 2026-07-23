# -*- coding: utf-8 -*-
"""
מכין את הנכסים שהדפדפן צריך כדי להפיק את טופס 101:
  1. src/assets/tofes-101.pdf   — הטופס הריק
  2. src/assets/heb.ttf         — גופן מצומצם לעברית, ספרות ולטינית בסיסית
  3. src/form101-map.json       — מפת הקואורדינטות, מיוצאת מ-form101_map.py
     כך שהפייתון והדפדפן עובדים מאותו מקור אחד.

  python scripts/build-assets.py
"""
import json, os, shutil, subprocess, sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
ASSETS = os.path.join(ROOT, "src", "assets")
os.makedirs(ASSETS, exist_ok=True)

sys.path.insert(0, HERE)
import form101_map as M   # noqa: E402

# --- 1. הטופס הריק ---
blank = os.environ.get("FORM_101_BLANK", r"C:\Users\גל\Desktop\tofes-101.pdf")
shutil.copyfile(blank, os.path.join(ASSETS, "tofes-101.pdf"))
print("blank pdf ->", round(os.path.getsize(os.path.join(ASSETS, "tofes-101.pdf")) / 1024), "KB")

# --- 2. גופן מצומצם ---
src_font = r"C:\Windows\Fonts\arial.ttf"
out_font = os.path.join(ASSETS, "heb.ttf")
subprocess.run([
    sys.executable, "-m", "fontTools.subset", src_font,
    "--unicodes=U+0020-007E,U+00A0,U+05D0-05EA,U+05B0-05C7,U+2013,U+2014,U+201C,U+201D,U+2018,U+2019",
    "--layout-features=*",
    "--output-file=" + out_font,
], check=True)
print("font ->", round(os.path.getsize(out_font) / 1024), "KB")

# --- 3. מפת הקואורדינטות ---
payload = {
    "text": {k: {"page": v[0], "xRight": v[1], "baseline": v[2], "size": v[3]}
             for k, v in M.TEXT.items()},
    "width": M.WIDTH,
    "comb": {k: {"page": v[0], "x0": v[1], "pitch": v[2], "baseline": v[3],
                 "count": v[4], "size": v[5]} for k, v in M.COMB.items()},
    "box": {k: {"page": v[0], "x": v[1], "y": v[2]} for k, v in M.BOX.items()},
    "kids": M.KIDS,
    "kidsFirstBaseline": M.KIDS_FIRST_BASELINE,
    "kidsRowH": M.KIDS_ROW_H,
    "p8Fields": {k: {"x": v[0], "baseline": v[1], "align": v[2]}
                 for k, v in M.P8_FIELDS.items()},
    "kidCounts": {str(k): v for k, v in M.KID_COUNTS.items()},
    "signatureRect": M.SIGNATURE_RECT,
}
out_map = os.path.join(ROOT, "src", "form101-map.json")
with open(out_map, "w", encoding="utf-8") as f:
    json.dump(payload, f, ensure_ascii=False, indent=1)
print("map ->", out_map)
