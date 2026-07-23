import fitz, sys, os
src = sys.argv[1]
out_dir = sys.argv[2] if len(sys.argv) > 2 else os.path.dirname(os.path.abspath(src))
d = fitz.open(src)
base = os.path.splitext(os.path.basename(src))[0]
for i, page in enumerate(d, start=1):
    page.get_pixmap(dpi=150).save(os.path.join(out_dir, f"{base}_p{i}.png"))
    print("wrote", f"{base}_p{i}.png")
