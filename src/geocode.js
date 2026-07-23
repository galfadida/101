/**
 * השלמת מיקוד אוטומטית.
 *
 * שירות ה-Geocoding הרגיל של גוגל דוחה מפתחות המוגבלים לדומיין ודורש הגבלת IP,
 * ולכן משתמשים ב-Geocoder של Maps JavaScript API — הוא נועד לרוץ בדפדפן
 * ועובד עם מפתח מוגבל-דומיין, שזה מה שבטוח לחשוף בקוד צד-לקוח.
 *
 * הסקריפט נטען רק כשמגיעים למסך הכתובת, כדי לא להכביד על שאר השאלון.
 */

const KEY = import.meta.env.VITE_MAPS_KEY || "";
const CACHE_KEY = "zipcache_v1";

let loader = null;

function loadMaps() {
  if (!KEY) return Promise.reject(new Error("no maps key"));
  if (window.google?.maps?.Geocoder) return Promise.resolve(window.google.maps);
  if (loader) return loader;

  loader = new Promise((resolve, reject) => {
    const cbName = "__mapsReady_" + Math.floor(performance.now());
    window[cbName] = () => {
      delete window[cbName];
      resolve(window.google.maps);
    };
    const s = document.createElement("script");
    s.async = true;
    s.src =
      "https://maps.googleapis.com/maps/api/js?key=" + encodeURIComponent(KEY) +
      "&language=he&region=IL&loading=async&callback=" + cbName;
    s.onerror = () => reject(new Error("maps script failed"));
    document.head.appendChild(s);
    setTimeout(() => reject(new Error("maps timeout")), 12000);
  }).catch((e) => {
    loader = null;
    throw e;
  });

  return loader;
}

function readCache() {
  try { return JSON.parse(localStorage.getItem(CACHE_KEY) || "{}"); }
  catch { return {}; }
}
function writeCache(map) {
  try { localStorage.setItem(CACHE_KEY, JSON.stringify(map)); } catch { /* quota */ }
}

function zipFrom(result) {
  const c = (result.address_components || []).find((x) => x.types.includes("postal_code"));
  const zip = c ? c.long_name.replace(/\D/g, "") : "";
  return zip.length === 7 ? zip : "";
}

/**
 * מחזיר מיקוד בן 7 ספרות, או "" אם לא נמצא.
 * לעולם אינו זורק — כישלון פירושו שהעובד ימלא ידנית, כמו קודם.
 */
export async function lookupZip(city, street, houseNo) {
  city = String(city || "").trim();
  street = String(street || "").trim();
  houseNo = String(houseNo || "").trim();
  if (!city || !street || !houseNo) return "";

  const key = `${city}|${street}|${houseNo}`;
  const cache = readCache();
  if (cache[key] !== undefined) return cache[key];

  try {
    const maps = await loadMaps();
    const geocoder = new maps.Geocoder();
    const { results } = await geocoder.geocode({
      address: `${street} ${houseNo}, ${city}`,
      componentRestrictions: { country: "IL" },
    });

    let zip = "";
    for (const r of results || []) {
      zip = zipFrom(r);
      if (zip) break;
    }
    cache[key] = zip;
    writeCache(cache);
    return zip;
  } catch (e) {
    console.warn("zip lookup failed", e);
    return "";
  }
}
