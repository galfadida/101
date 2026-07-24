/**
 * חיפוש מיקוד מקומי מתוך קובץ המיקוד הרשמי (odata.org.il, נתוני דואר ישראל).
 *
 * הקובץ public/zipdata.json נבנה ע"י scripts/build-zipdb.py:
 *   - חיבור לפי סמל למ"ס (סמל_ישוב / סמל_רחוב) בין נתוני הדואר ל-data.gov.il,
 *     כך שהמפתחות הם בדיוק שמות הרחובות שהעובד בוחר מהרשימה.
 *   - כיסוי ברמת-בית ל-91 הערים הגדולות + מיקוד ברירת-מחדל ל~888 יישובים.
 *
 * נטען פעם אחת, בעצלתיים, כשמגיעים למסך הכתובת. כישלון טעינה מחזיר null
 * וה-קורא נופל חזרה ל-Geocoder של גוגל, ואז למילוי ידני.
 */

let DB = null;
let loader = null;

function load() {
  if (DB) return Promise.resolve(DB);
  if (loader) return loader;
  loader = fetch("/zipdata.json", { cache: "force-cache" })
    .then((r) => { if (!r.ok) throw new Error("zipdata " + r.status); return r.json(); })
    .then((json) => { DB = json; return DB; })
    .catch((e) => { loader = null; console.warn("zipdb load failed", e); return null; });
  return loader;
}

// נרמול זהה ל-norm() בפייתון: גזירת רווחים, הסרת גרש/מרכאות, החלפת מקף/נקודה ברווח.
function norm(s) {
  s = String(s == null ? "" : s).trim();
  s = s.replace(/[״׳"']/g, "");
  s = s.replace(/[-.]/g, " ");
  s = s.replace(/\s+/g, " ").trim();
  return s;
}

function valid(z) { return z && z.length === 7 && z !== "0000000"; }

function houseMapOf(db, city, street) {
  const ck = norm(city), sk = norm(street);
  if (!ck || !sk) return null;
  return db.addr[ck + "|" + sk] || null;
}

// שכן קרוב באותה זוגיות (אותו צד של הרחוב) — לרוב אותו מיקוד, אך לא ודאי.
function nearest(houseMap, house) {
  const h = parseInt(String(house).replace(/\D/g, ""), 10);
  if (!isFinite(h)) { const f = Object.values(houseMap)[0]; return f || ""; }
  let best = "", bestDist = Infinity, anyBest = "", anyDist = Infinity;
  for (const k in houseMap) {
    const hk = parseInt(k, 10);
    if (!isFinite(hk)) continue;
    const d = Math.abs(hk - h);
    if (d < anyDist) { anyDist = d; anyBest = houseMap[k]; }
    if (hk % 2 === h % 2 && d < bestDist) { bestDist = d; best = houseMap[k]; }
  }
  return best || anyBest || "";
}

/**
 * מיקוד ודאי בלבד: התאמה מדויקת של מספר הבית, או מיקוד יחיד ליישוב קטן.
 * מחזיר "" אם אין התאמה מדויקת — כדי שהקורא ינסה את גוגל (עדכני יותר).
 */
export async function localZip(city, street, house) {
  try {
    const db = await load();
    if (!db) return "";
    const ck = norm(city);
    if (!ck) return "";
    const d = houseMapOf(db, city, street);
    if (d) {
      const h = parseInt(String(house).replace(/\D/g, ""), 10);
      if (isFinite(h) && valid(d[h])) return d[h];   // התאמת בית מדויקת בלבד
    }
    const cz = db.cityZip[ck];                        // יישוב עם מיקוד יחיד — ודאי
    if (valid(cz)) return cz;
    return "";
  } catch (e) {
    console.warn("localZip failed", e);
    return "";
  }
}

/**
 * הערכה: שכן קרוב באותו רחוב. משמש רק כמוצא אחרון, אחרי שגם גוגל נכשל.
 */
export async function localZipApprox(city, street, house) {
  try {
    const db = await load();
    if (!db) return "";
    const d = houseMapOf(db, city, street);
    if (d) {
      const z = nearest(d, house);
      if (valid(z)) return z;
    }
    return "";
  } catch (e) {
    return "";
  }
}
