import fitz, sys, os
src, pno, x0, y0, x1, y1 = sys.argv[1], int(sys.argv[2]), *[float(v) for v in sys.argv[3:7]]
out = sys.argv[7]
d = fitz.open(src)
page = d[pno - 1]
print("images on page:", len(page.get_images(full=True)))
page.get_pixmap(dpi=260, clip=fitz.Rect(x0, y0, x1, y1)).save(out)
print("wrote", out)
