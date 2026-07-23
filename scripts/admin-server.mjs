/**
 * ממשק אדמין מקומי ליצירת קישורי בדיקה.
 * רץ על המחשב עם מפתח השירות — לא נחשף לאינטרנט.
 *
 *   npm run admin
 * ואז לפתוח http://localhost:7100
 */
import { createServer } from "node:http";
import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import QRCode from "qrcode";
import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore, Timestamp, FieldValue } from "firebase-admin/firestore";
import { getAuth } from "firebase-admin/auth";

const PORT = 7100;
const SITE = process.env.FORM_BASE_URL || "https://shaul-tamrukim-tofes-101.web.app";
const COMPANY = 'שאול בטיש הלוי שאול תמרוקים בע"מ';
const BRANCHES = ["שילת סנטר 1", "קניון רמות", "ברנדייס", "בית שמש", "בר אילן"];

const sa = JSON.parse(readFileSync("./service-account.json", "utf8"));
initializeApp({ credential: cert(sa), projectId: sa.project_id });
const db = getFirestore();

function json(res, code, body) {
  res.writeHead(code, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(body));
}
function readBody(req) {
  return new Promise((resolve) => {
    let data = "";
    req.on("data", (c) => (data += c));
    req.on("end", () => { try { resolve(JSON.parse(data || "{}")); } catch { resolve({}); } });
  });
}

async function createEmployee({ firstName, lastName, gender, branch, mobile, days }) {
  const empRef = db.collection("employees").doc();
  const token = randomBytes(32).toString("base64url");
  const expiresAt = Timestamp.fromMillis(Date.now() + (Number(days) || 14) * 864e5);
  const profile = {
    firstName: (firstName || "").trim(),
    lastName: (lastName || "").trim(),
    gender: gender === "m" ? "m" : "f",
    branch: branch || BRANCHES[4],
    mobile: (mobile || "").trim(),
    company: COMPANY,
  };
  await db.batch()
    .set(empRef, { ...profile, status: "invited", createdAt: FieldValue.serverTimestamp() })
    .set(empRef.collection("public").doc("profile"), profile)
    .set(db.collection("invites").doc(token), {
      employeeId: empRef.id, revoked: false, expiresAt, claimedUid: null, claimedAt: null,
      createdAt: FieldValue.serverTimestamp(),
    })
    .commit();
  const link = `${SITE}/?t=${token}`;
  const qr = await QRCode.toDataURL(link, { width: 260, margin: 1, color: { dark: "#2B2330", light: "#ffffff" } });
  return { employeeId: empRef.id, token, link, qr, expiresAt: expiresAt.toDate().toISOString(), profile };
}

async function listInvites() {
  const snap = await db.collection("invites").orderBy("createdAt", "desc").limit(40).get();
  const rows = [];
  for (const d of snap.docs) {
    const v = d.data();
    let name = "";
    try {
      const emp = await db.doc(`employees/${v.employeeId}`).get();
      if (emp.exists) name = `${emp.data().firstName || ""} ${emp.data().lastName || ""}`.trim();
    } catch { /* ignore */ }
    const now = Date.now();
    const state = v.revoked ? "revoked"
      : (v.expiresAt?.toMillis?.() ?? 0) < now ? "expired"
      : v.claimedUid ? "opened" : "waiting";
    rows.push({ token: d.id, employeeId: v.employeeId, name, state,
      expiresAt: v.expiresAt?.toDate?.().toISOString() || null, link: `${SITE}/?t=${d.id}` });
  }
  return rows;
}

async function revoke(token) {
  await db.collection("invites").doc(token).update({ revoked: true });
}

async function deleteEmployee(token) {
  const inv = await db.collection("invites").doc(token).get();
  if (inv.exists) {
    const empId = inv.data().employeeId;
    if (empId) await db.recursiveDelete(db.doc(`employees/${empId}`));
    const binds = await db.collection("bindings").where("employeeId", "==", empId).get();
    for (const b of binds.docs) { await getAuth().deleteUser(b.id).catch(() => {}); await b.ref.delete(); }
  }
  await db.collection("invites").doc(token).delete();
}

const PAGE = readFileSync(new URL("./admin-ui.html", import.meta.url), "utf8")
  .replace("__BRANCHES__", JSON.stringify(BRANCHES));

const server = createServer(async (req, res) => {
  try {
    if (req.method === "GET" && req.url === "/") {
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      return res.end(PAGE);
    }
    if (req.method === "POST" && req.url === "/api/create") {
      return json(res, 200, await createEmployee(await readBody(req)));
    }
    if (req.method === "GET" && req.url === "/api/list") {
      return json(res, 200, { rows: await listInvites() });
    }
    if (req.method === "POST" && req.url === "/api/revoke") {
      await revoke((await readBody(req)).token); return json(res, 200, { ok: true });
    }
    if (req.method === "POST" && req.url === "/api/delete") {
      await deleteEmployee((await readBody(req)).token); return json(res, 200, { ok: true });
    }
    res.writeHead(404); res.end("not found");
  } catch (e) {
    console.error(e);
    json(res, 500, { error: String(e.message || e) });
  }
});

server.listen(PORT, () => {
  console.log("\n  ✦ ממשק ניהול הקישורים רץ כאן:");
  console.log("    http://localhost:" + PORT + "\n");
});
