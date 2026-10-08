// Netlify Function: إشعارات مالك منصة الريان
// يوضع في المستودع داخل: netlify/functions/notify-admin.js
//
// القنوات (تُرسل كلها معاً، ويكفي نجاح واحدة):
//   1) تيليجرام:  TELEGRAM_BOT_TOKEN  و  TELEGRAM_CHAT_ID
//   2) إشعار الجوال (Web Push): VAPID_PUBLIC_KEY و VAPID_PRIVATE_KEY + تفعيل الزر من لوحة المالك
//   3) واتساب CallMeBot (احتياطي فقط إن فشلت القناتان): CALLMEBOT_PHONE و CALLMEBOT_APIKEY
// اختياري: ALLOWED_HOSTS نطاقات إضافية مفصولة بفواصل

const https = require("https");
let webpush = null;
try { webpush = require("web-push"); } catch (e) { webpush = null; }

const FIREBASE_PROJECT = "alrayan-15db4";
const BASE_HOSTS = [
  "alrayanmarket.netlify.app", "localhost", "127.0.0.1",
  "alrayanmarket.com", "www.alrayanmarket.com",
  "akrayanmarket.com", "www.akrayanmarket.com"
];
const PER_IP_PER_MIN = 6;
const GLOBAL_PER_MIN = 40;
const MAX_LEN = 1000;

const ipHits = new Map();
let globalHits = [];

function json(statusCode, obj) {
  return { statusCode, headers: { "Content-Type": "application/json" }, body: JSON.stringify(obj) };
}

function allowedHost(event) {
  const src = event.headers.origin || event.headers.referer || "";
  let host = "";
  try { host = new URL(src).hostname; } catch (e) { return false; }
  const extra = (process.env.ALLOWED_HOSTS || "").split(",").map(s => s.trim()).filter(Boolean);
  return BASE_HOSTS.concat(extra).includes(host) || host.endsWith("--alrayanmarket.netlify.app");
}

function rateLimited(ip) {
  const now = Date.now(), win = 60 * 1000;
  globalHits = globalHits.filter(t => now - t < win);
  if (globalHits.length >= GLOBAL_PER_MIN) return true;
  const list = (ipHits.get(ip) || []).filter(t => now - t < win);
  if (list.length >= PER_IP_PER_MIN) { ipHits.set(ip, list); return true; }
  list.push(now); ipHits.set(ip, list); globalHits.push(now);
  if (ipHits.size > 2000) ipHits.clear();
  return false;
}

function request(url, opts, body, timeoutMs) {
  return new Promise((resolve) => {
    const req = https.request(url, opts || {}, (res) => {
      let data = "";
      res.on("data", (c) => { if (data.length < 20000) data += c; });
      res.on("end", () => resolve({ status: res.statusCode || 0, body: data }));
    });
    req.setTimeout(timeoutMs || 6000, () => { req.destroy(); resolve({ status: 0, body: "timeout" }); });
    req.on("error", (e) => resolve({ status: 0, body: String((e && e.message) || "error") }));
    if (body) req.write(body);
    req.end();
  });
}

// ── 1) تيليجرام ──
async function sendTelegram(text) {
  const token = process.env.TELEGRAM_BOT_TOKEN, chat = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chat) return { name: "تيليجرام", ok: false, skipped: true, info: "غير مُعدّ" };
  const body = JSON.stringify({ chat_id: chat, text: text, disable_web_page_preview: true });
  const r = await request("https://api.telegram.org/bot" + token + "/sendMessage",
    { method: "POST", headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(body) } }, body, 6000);
  let j = {}; try { j = JSON.parse(r.body); } catch (e) {}
  if (j.ok) return { name: "تيليجرام", ok: true };
  let info = j.description || ("HTTP " + r.status);
  if (/chat not found/i.test(info)) info = "رقم المحادثة خطأ أو لم تضغط Start في البوت";
  if (/Unauthorized/i.test(info)) info = "رمز البوت خطأ";
  return { name: "تيليجرام", ok: false, info: info.slice(0, 120) };
}

// ── 2) إشعار الجوال (Web Push) ──
async function readAdminSubs() {
  const url = "https://firestore.googleapis.com/v1/projects/" + FIREBASE_PROJECT +
    "/databases/(default)/documents/adminPush/owner";
  const r = await request(url, { method: "GET" }, null, 4000);
  if (r.status !== 200) return [];
  try {
    const j = JSON.parse(r.body);
    const vals = (((j.fields || {}).subs || {}).arrayValue || {}).values || [];
    return vals.map(v => { try { return JSON.parse(v.stringValue); } catch (e) { return null; } })
      .filter(s => s && s.endpoint);
  } catch (e) { return []; }
}

async function sendPush(text) {
  const pub = process.env.VAPID_PUBLIC_KEY, priv = process.env.VAPID_PRIVATE_KEY;
  if (!webpush) return { name: "الجوال", ok: false, skipped: true, info: "مكتبة web-push غير مثبتة" };
  if (!pub || !priv) return { name: "الجوال", ok: false, skipped: true, info: "مفاتيح VAPID غير مضبوطة" };
  const subs = await readAdminSubs();
  if (!subs.length) return { name: "الجوال", ok: false, skipped: true, info: "لم يُفعَّل على أي جهاز" };
  try { webpush.setVapidDetails("mailto:owner@alrayan-market.app", pub, priv); }
  catch (e) { return { name: "الجوال", ok: false, info: "مفاتيح VAPID غير صالحة" }; }
  const lines = text.split("\n").filter(Boolean);
  const title = (lines[1] || lines[0] || "منصة الريان").slice(0, 60);
  const payload = JSON.stringify({ title: "🔔 " + title, body: lines.slice(2).join(" · ").slice(0, 180) || text.slice(0, 180), url: "/" });
  let okCount = 0, lastErr = "";
  await Promise.all(subs.map(s => webpush.sendNotification(s, payload, { TTL: 86400, timeout: 5000 })
    .then(() => { okCount++; })
    .catch(e => { lastErr = (e && e.statusCode === 410) ? "اشتراك منتهٍ، أعد التفعيل" : String((e && (e.body || e.message)) || "خطأ").slice(0, 100); })));
  return okCount ? { name: "الجوال", ok: true, info: okCount + " جهاز" } : { name: "الجوال", ok: false, info: lastErr };
}

// ── 3) واتساب CallMeBot (احتياطي) ──
async function sendCallMeBot(text) {
  const phone = process.env.CALLMEBOT_PHONE, apikey = process.env.CALLMEBOT_APIKEY;
  if (!phone || !apikey) return { name: "واتساب", ok: false, skipped: true, info: "غير مُعدّ" };
  const url = "https://api.callmebot.com/whatsapp.php?phone=" + encodeURIComponent(phone) +
    "&text=" + encodeURIComponent(text.slice(0, 250)) + "&apikey=" + encodeURIComponent(apikey);
  const r = await request(url, { method: "GET" }, null, 4000);
  const plain = r.body.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
  const bad = /(invalid|error|not\s*valid|blocked|paused|wrong|denied|timeout|too many)/i.test(plain);
  const ok = r.status >= 200 && r.status < 300 && !bad;
  return { name: "واتساب", ok, info: ok ? "" : (/too many/i.test(plain) ? "موقوف مؤقتاً لكثرة الطلبات" : plain.slice(0, 80)) };
}

function summary(results) {
  return results.filter(r => !(r.skipped && r.name === "واتساب"))
    .map(r => r.name + (r.ok ? " ✓" : " ✗") + (r.info ? " (" + r.info + ")" : "")).join(" · ");
}

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") return json(405, { ok: false, error: "method_not_allowed" });
  if (!allowedHost(event)) return json(403, { ok: false, error: "forbidden_origin" });

  const ip = event.headers["x-nf-client-connection-ip"] || (event.headers["x-forwarded-for"] || "").split(",")[0].trim() || "unknown";
  if (rateLimited(ip)) return json(429, { ok: false, error: "rate_limited" });

  let text = "";
  try { text = String((JSON.parse(event.body || "{}").text) || "").trim(); } catch (e) { text = ""; }
  if (!text) return json(400, { ok: false, error: "empty_text" });
  if (text.length > MAX_LEN) text = text.slice(0, MAX_LEN - 3) + "...";

  const results = await Promise.all([sendTelegram(text), sendPush(text)]);
  if (!results.some(r => r.ok)) results.push(await sendCallMeBot(text));

  const ok = results.some(r => r.ok);
  return json(ok ? 200 : 502, { ok, detail: summary(results) || "لا توجد قناة مُعدّة" });
};
