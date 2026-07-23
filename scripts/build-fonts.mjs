/**
 * מוריד את Rubik (עברית + לטינית, משקלים 400/500/600/700) מ-Google Fonts
 * ושומר אותו מקומית עם קובץ CSS שמצביע על הקבצים המקומיים, כדי שהגופן
 * יהיה מוטמע ולא תלוי באינטרנט.
 *
 *   node scripts/build-fonts.mjs
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, "..", "src", "assets", "fonts");
mkdirSync(OUT, { recursive: true });

const css = readFileSync(join(OUT, "rubik.css"), "utf8");

// מפרקים לבלוקים של @font-face, שומרים רק עברית ולטינית
const blocks = css.split("@font-face").slice(1).map((b) => "@font-face" + b.split("}")[0] + "}");
const wanted = blocks.filter((b) => {
  const before = css.slice(0, css.indexOf(b));
  const lastComment = before.lastIndexOf("/*");
  const subset = before.slice(lastComment, lastComment + 20);
  return /hebrew|latin \*/.test(subset);
});

let out = "/* Rubik — עברית + לטינית, מוטמע מקומית */\n\n";
let n = 0;
for (const raw of blocks) {
  const url = (raw.match(/url\((https:\/\/[^)]+\.woff2)\)/) || [])[1];
  if (!url) continue;
  // subset מהתגובה שלפני הבלוק
  const idx = css.indexOf(raw);
  const comment = css.slice(0, idx).match(/\/\* ([a-z-]+) \*\/\s*$/);
  const subset = comment ? comment[1] : "x";
  if (subset !== "hebrew" && subset !== "latin") continue;

  const weight = (raw.match(/font-weight:\s*(\d+)/) || [])[1] || "400";
  const fname = `rubik-${subset}-${weight}.woff2`;
  const buf = Buffer.from(await (await fetch(url)).arrayBuffer());
  writeFileSync(join(OUT, fname), buf);
  n++;
  console.log(`  ${fname}  ${Math.round(buf.length / 1024)}KB`);

  out += raw.replace(/url\(https:\/\/[^)]+\.woff2\)/, `url(./${fname})`) + "\n\n";
}

writeFileSync(join(OUT, "rubik-local.css"), out, "utf8");
console.log(`\nwrote ${n} font files + rubik-local.css`);
