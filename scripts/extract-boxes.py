# תיבות הסימון בטופס 101 הן תווי ZapfDingbats. הסקריפט מאתר את כולן
# ומצמיד לכל אחת את הטקסט שמשמאלה (בעברית התיבה נמצאת מימין לתווית).
import fitz, sys, json, os

PDF = sys.argv[1] if len(sys.argv) > 1 else r"C:\Users\גל\Desktop\tofes-101.pdf"
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "boxes.json")
doc = fitz.open(PDF)

catalogue = {}
for pno, page in enumerate(doc, start=1):
    spans = []
    for b in page.get_text("rawdict")["blocks"]:
        for l in b.get("lines", []):
            for s in l.get("spans", []):
                txt = "".join(c["c"] for c in s["chars"]).strip()
                spans.append({
                    "font": s["font"], "x": s["bbox"][0], "y": s["bbox"][1],
                    "x1": s["bbox"][2], "size": s["size"], "text": txt,
                })

    boxes = [s for s in spans if s["font"] == "ZapfDingbats" and s["text"]]
    texts = [s for s in spans if s["font"] != "ZapfDingbats" and s["text"]]

    rows = []
    for bx in boxes:
        cy = bx["y"] + bx["size"] / 2
        left = [t for t in texts
                if abs(t["y"] + t["size"] / 2 - cy) < 6 and t["x1"] <= bx["x"] + 2]
        left.sort(key=lambda t: -(t["x1"]))
        label = " ".join(t["text"] for t in left[:2])[:60]
        rows.append({"x": round(bx["x"], 1), "y": round(bx["y"], 1),
                     "size": round(bx["size"], 1), "label": label})

    rows.sort(key=lambda r: (round(r["y"] / 3), -r["x"]))
    catalogue[pno] = rows
    print(f"--- page {pno}: {len(rows)} checkboxes ---")
    for r in rows:
        print(f"  x={r['x']:6.1f} y={r['y']:6.1f}  {r['label']}")

with open(OUT, "w", encoding="utf-8") as f:
    json.dump(catalogue, f, ensure_ascii=False, indent=1)
print("\nwrote", OUT)
