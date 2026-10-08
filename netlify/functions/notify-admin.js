// Netlify Function: إشعار واتساب لمالك منصة الريان عبر CallMeBot
// يوضع في المستودع داخل: netlify/functions/notify-admin.js
//
// متغيرات البيئة المطلوبة في Netlify (Site configuration → Environment variables):
//   CALLMEBOT_PHONE   رقم البوت بدون + (مثال: 249966009977)
//   CALLMEBOT_APIKEY  مفتاح CallMeBot
//   ALLOWED_HOSTS     (اختياري) نطاقات إضافية مفصولة بفواصل، مثل: alrayanmarket.com,www.alrayanmarket.com

const https = require("https");

const BASE_HOSTS = ["alrayanmarket.netlify.app", "localhost", "127.0.0.1"];
const PER_IP_PER_MIN = 6;     // حد لكل زائر في الدقيقة
const GLOBAL_PER_MIN = 40;    // حد عام في الدقيقة
const MAX_LEN = 250;

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
  const list = BASE_HOSTS.concat(extra);
  return list.includes(host) || host.endsWith("--alrayanmarket.netlify.app");
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

function callMeBot(phone, apikey, text) {
  const url = "https://api.callmebot.com/whatsapp.php?phone=" + encodeURIComponent(phone)
    + "&text=" + encodeURIComponent(text) + "&apikey=" + encodeURIComponent(apikey);
  return new Promise((resolve) => {
    const req = https.get(url, (res) => {
      let body = "";
      res.on("data", (c) => { if (body.length < 4000) body += c; });
      res.on("end", () => resolve({ status: res.statusCode || 0, body }));
    });
    req.setTimeout(8000, () => { req.destroy(); resolve({ status: 0, body: "timeout" }); });
    req.on("error", (e) => resolve({ status: 0, body: String(e && e.message || "error") }));
  });
}

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") return json(405, { ok: false, error: "method_not_allowed" });

  const phone = process.env.CALLMEBOT_PHONE;
  const apikey = process.env.CALLMEBOT_APIKEY;
  if (!phone || !apikey) return json(500, { ok: false, error: "البوت غير مُعدّ في Netlify (CALLMEBOT_PHONE / CALLMEBOT_APIKEY)" });

  if (!allowedHost(event)) return json(403, { ok: false, error: "forbidden_origin" });

  const ip = event.headers["x-nf-client-connection-ip"] || (event.headers["x-forwarded-for"] || "").split(",")[0].trim() || "unknown";
  if (rateLimited(ip)) return json(429, { ok: false, error: "rate_limited" });

  let text = "";
  try { text = String((JSON.parse(event.body || "{}").text) || "").trim(); } catch (e) { text = ""; }
  if (!text) return json(400, { ok: false, error: "empty_text" });
  if (text.length > MAX_LEN) text = text.slice(0, MAX_LEN - 3) + "...";

  const r = await callMeBot(phone, apikey, text);
  const plain = r.body.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim().slice(0, 180);
  const bad = /(invalid|error|not\s*valid|blocked|paused|wrong|denied|timeout)/i.test(plain);
  const ok = r.status >= 200 && r.status < 300 && !bad;
  return json(ok ? 200 : 502, { ok, detail: ok ? "sent" : (plain || ("HTTP " + r.status)) });
};
