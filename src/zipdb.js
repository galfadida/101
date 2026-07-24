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

function pick(houseMap, house) {
  const h = parseInt(String(house).replace(/\D/g, ""), 10);
  if (!isFinite(h)) {
    // אין מספר בית תקין — נחזיר את המיקוד הראשון אם קיים
    const first = Object.values(houseMap)[0];
    return first || "";
  }
  if (houseMap[h] != null) return houseMap[h];
  // שכן קרוב באותה זוגיות (אותו צד של הרחוב) — לרוב אותו מיקוד
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
 * מחזיר מיקוד בן 7 ספרות מהמאגר המקומי, או "" אם אין התאמה.
 * לעולם אינו זורק.
 */
export async function localZip(city, street, house) {
  try {
    const db = await load();
    if (!db) return "";
    const ck = norm(city), sk = norm(street);
    if (!ck) return "";
    const d = sk ? db.addr[ck + "|" + sk] : null;
    if (d) {
      const z = pick(d, house);
      if (z && z.length === 7 && z !== "0000000") return z;
    }
    // ברירת מחדל עירונית (יישוב עם מיקוד יחיד)
    const cz = db.cityZip[ck];
    if (cz && cz.length === 7 && cz !== "0000000") return cz;
    return "";
  } catch (e) {
    console.warn("localZip failed", e);
    return "";
  }
}
