import fitz, sys
PDF = sys.argv[1] if len(sys.argv) > 1 else r"C:\Users\גל\Desktop\tofes-101.pdf"
pno = int(sys.argv[2]) if len(sys.argv) > 2 else 1
y0, y1, x0, x1 = (float(v) for v in sys.argv[3:7])
page = fitz.open(PDF)[pno - 1]
for b in page.get_text("rawdict")["blocks"]:
    for l in b.get("lines", []):
        for s in l.get("spans", []):
            bx = s["bbox"]
            if not (y0 <= bx[1] <= y1 and x0 <= bx[2] and bx[0] <= x1):
                continue
            txt = "".join(c["c"] for c in s["chars"])
            if not txt.strip():
                continue
            print(f"font={s['font']:<26} size={s['size']:.2f} "
                  f"bbox=({bx[0]:.1f},{bx[1]:.1f},{bx[2]:.1f},{bx[3]:.1f}) {txt!r}")
