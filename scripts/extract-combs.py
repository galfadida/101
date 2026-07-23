# -*- coding: utf-8 -*-
"""
מאתר את השדות המשובצים בטופס הריק ומחשב את מרכז כל תא.
תאי הטופס מופרדים בקווים אנכיים מקווקווים; גבולות השדה הם קווים מלאים
או דפנות המסגרת. מרכז התא = אמצע המרווח בין שני מפרידים סמוכים.
"""
import fitz, sys, json, os
from collections import defaultdict

PDF = sys.argv[1] if len(sys.argv) > 1 else r"C:\Users\גל\Desktop\tofes-101.pdf"
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "combs.json")
doc = fitz.open(PDF)

result = {}
for pno, page in enumerate(doc, start=1):
    # קווים אנכיים קצרים = מפרידי תאים
    seps = defaultdict(list)      # baseline -> [x...]
    verticals = []                # כל הקווים האנכיים, לגבולות השדה
    for d in page.get_drawings():
        for it in d["items"]:
            if it[0] == "l":
                p1, p2 = it[1], it[2]
                if abs(p1.x - p2.x) < 0.6 and abs(p1.y - p2.y) > 1:
                    bottom = max(p1.y, p2.y)
                    verticals.append((round(p1.x, 1), round(bottom, 1), abs(p1.y - p2.y)))
                    if d.get("dashes") and d["dashes"] not in ("[] 0", ""):
                        seps[round(bottom)].append(round(p1.x, 1))
            elif it[0] == "re":
                r = it[1]
                for x in (r.x0, r.x1):
                    verticals.append((round(x, 1), round(r.y1, 1), r.height))

    fields = []
    for base, xs in seps.items():
        xs = sorted(set(xs))
        # גבולות אפשריים: כל קו אנכי שנוגע באותו קו תחתון
        bounds = sorted({v[0] for v in verticals if abs(v[1] - base) <= 3})
        groups, cur = [], [xs[0]]
        for a, b in zip(xs, xs[1:]):
            if b - a <= 20:
                cur.append(b)
            else:
                groups.append(cur); cur = [b]
        groups.append(cur)

        for g in groups:
            if len(g) < 2:
                continue
            pitch = (g[-1] - g[0]) / (len(g) - 1)
            if pitch < 4:
                continue
            left = max([b for b in bounds if b < g[0] - 1] or [g[0] - pitch])
            right = min([b for b in bounds if b > g[-1] + 1] or [g[-1] + pitch])
            # משלימים מפרידים חסרים לכיוון גבולות השדה, לפי אותו מרווח
            edges = list(g)
            x = g[0] - pitch
            while x > left + pitch * 0.45:
                edges.insert(0, round(x, 1)); x -= pitch
            x = g[-1] + pitch
            while x < right - pitch * 0.45:
                edges.append(round(x, 1)); x += pitch
            edges = [left] + edges + [right]
            centers = [round((a + b) / 2, 1) for a, b in zip(edges, edges[1:])]
            if len(centers) >= 3:
                fields.append({"baseline": base, "cells": len(centers),
                               "pitch": round(pitch, 2), "centers": centers})

    fields.sort(key=lambda f: (f["baseline"], f["centers"][0]))
    result[pno] = fields
    print(f"--- page {pno}: {len(fields)} comb fields ---")
    for f in fields:
        print(f"  baseline={f['baseline']:6.0f} cells={f['cells']:2d} pitch={f['pitch']:5.2f} "
              f"x {f['centers'][0]:6.1f} .. {f['centers'][-1]:6.1f}")

with open(OUT, "w", encoding="utf-8") as f:
    json.dump(result, f, ensure_ascii=False, indent=1)
print("\nwrote", OUT)
