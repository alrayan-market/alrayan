// netlify/edge-functions/channel-share.js
// معاينة الروابط عند المشاركة (واتساب، فيسبوك، تيليجرام...)
// تعمل لبوتات المعاينة فقط، ولا تغيّر شيئاً للزائر العادي.
// الروابط المدعومة: ?prop= عقار · ?req= طلب · ?ad= إعلان · ?video= · ?poll= · ?publish=

const FIREBASE_PROJECT_ID = "alrayan-15db4";
const FIREBASE_API_KEY = "AIzaSyC7-MKB7Ix3k0gA7tGxCXNFaty5IQ-U3Xg";
const SITE_LOGO = "https://alrayanmarket.netlify.app/icon-512.png";
const SITE_NAME = "منصة الريان السوق السوداني";
const BOT = /facebookexternalhit|Facebot|Twitterbot|WhatsApp|TelegramBot|LinkedInBot|Slackbot|Discordbot|Pinterest|redditbot|vkShare|Skype|Viber|Googlebot/i;

const PROP_TYPES = { land: "أرض", house: "منزل", apartment: "شقة", shop: "محل", farm: "مزرعة", office: "مكتب / مبنى" };
const DEALS = { sale: "للبيع", rent: "للإيجار", buy: "شراء", rent_req: "إيجار" };
const RQ_KINDS = { property: "🏡 مطلوب عقار", car: "🚗 مطلوب سيارة", other: "📝 مطلوب" };

function esc(s) { return String(s || "").replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }
function ytId(url) { const m = (url || "").match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|shorts\/))([A-Za-z0-9_-]{11})/); return m ? m[1] : ""; }
function str(f, k) { return (f[k] && f[k].stringValue) || ""; }
function num(f, k) { const v = f[k]; if (!v) return 0; return Number(v.integerValue || v.doubleValue || v.stringValue || 0) || 0; }
function firstImg(f, single, list) {
  let u = str(f, single);
  if (!u && f[list] && f[list].arrayValue && f[list].arrayValue.values && f[list].arrayValue.values.length) {
    u = f[list].arrayValue.values[0].stringValue || "";
  }
  return u;
}
// واتساب يتجاهل الصور الكبيرة (عدة ميغابايت)، فنمرّرها مصغّرة 800×420 بصيغة JPG
function ogImg(u) {
  if (!u || u === SITE_LOGO || /ytimg\.com/.test(u)) return u;
  return "https://wsrv.nl/?url=" + encodeURIComponent(u) + "&w=800&h=420&fit=cover&a=attention&output=jpg&q=65";
}
function money(n) { return n > 0 ? n.toLocaleString("en-US") + " ج.س" : ""; }

async function fireGet(col, id) {
  const u = `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}/databases/(default)/documents/${col}/${encodeURIComponent(id)}?key=${FIREBASE_API_KEY}`;
  const r = await fetch(u);
  if (!r.ok) return null;
  const d = await r.json();
  return (d && d.fields) || null;
}

export default async (request, context) => {
  const ua = request.headers.get("user-agent") || "";
  const url = new URL(request.url);
  const p = (k) => url.searchParams.get(k);
  const prop = p("prop"), req = p("req"), ad = p("ad"), vid = p("video"), poll = p("poll"), publish = p("publish");
  if ((!prop && !req && !ad && !vid && !poll && !publish) || !BOT.test(ua)) return context.next();

  let title = SITE_NAME, desc = "عقارات موثّقة · مكاتب معتمدة · خزانات مياه · متاجر سودانية", image = SITE_LOGO;
  try {
    if (prop) {
      const f = await fireGet("properties", prop);
      if (f) {
        const price = money(num(f, "price")) || "السعر عند التواصل";
        const area = num(f, "area");
        const type = PROP_TYPES[str(f, "type")] || "عقار";
        const deal = DEALS[str(f, "deal")] || "";
        const where = [str(f, "city"), str(f, "district")].filter(Boolean).join(" · ");
        title = "🏡 " + (str(f, "title") || (type + " " + deal));
        desc = [type + (deal ? " " + deal : ""), price, where, area ? area + " م²" : ""].filter(Boolean).join(" · ");
        const office = str(f, "officeName");
        if (office) desc += " · مكتب " + office + " الموثّق";
        const img = firstImg(f, "image", "images");
        if (img) image = img;
      }
    } else if (req) {
      const f = await fireGet("requests", req);
      if (f) {
        const kind = RQ_KINDS[str(f, "kind")] || "📝 مطلوب";
        const budget = money(num(f, "budget")) || "ميزانية مفتوحة";
        title = kind + ": " + (str(f, "title") || "");
        desc = [str(f, "city"), "💰 " + budget, "عندك ما يناسبه؟ تواصل عبر منصة الريان"].filter(Boolean).join(" · ");
      }
    } else if (ad) {
      const f = await fireGet("ads", ad);
      if (f) {
        title = str(f, "adTitle") || "إعلان على منصة الريان";
        desc = str(f, "adDesc") || "شاهد الإعلان على منصة الريان";
        const img = firstImg(f, "adImage", "adImages");
        if (img) image = img;
      }
    } else if (vid) {
      const f = await fireGet("entVideos", vid);
      if (f) {
        title = str(f, "title") || "فيديو على قناة الريان";
        desc = "شاهد الآن على قناة الريان";
        const yid = ytId(str(f, "url"));
        if (yid) image = `https://i.ytimg.com/vi/${yid}/hqdefault.jpg`;
      }
    } else if (poll) {
      const f = await fireGet("entPredicts", poll);
      if (f) {
        title = str(f, "title") || "استطلاع على قناة الريان";
        desc = str(f, "sub") || "شارك برأيك في استطلاع الريان";
        const img = str(f, "image");
        if (img) image = img;
      }
    } else if (publish) {
      const T = {
        property: ["🏠 انشر عقارك مجاناً", "أرض أو بيت أو شقة للبيع أو الإيجار؟ انشرها على منصة الريان ويصلك المشتري على واتساب"],
        office: ["🏢 سجّل مكتبك العقاري", "احصل على شارة «مكتب موثّق» وانشر عقاراتك على منصة الريان"],
        request: ["🔎 اطلب ما تبحث عنه", "تدوّر على عقار أو عربية؟ اكتب طلبك ويجيك أصحاب العروض على واتساب"]
      }[publish];
      if (T) { title = T[0]; desc = T[1]; }
    }
  } catch (e) { return context.next(); }

  const res = await context.next();
  let html = await res.text();
  const big = image !== SITE_LOGO;
  const finalImg = ogImg(image);
  const sT = esc(title), sD = esc(desc.slice(0, 200)), sI = esc(finalImg), sU = esc(url.toString());
  html = html.replace(/<title>.*?<\/title>/, `<title>${sT}</title>`);
  html = html.replace(/<meta property="og:title" content=".*?">/, `<meta property="og:title" content="${sT}">`);
  html = html.replace(/<meta property="og:description" content=".*?">/, `<meta property="og:description" content="${sD}">`);
  html = html.replace(/<meta property="og:image" content=".*?">/,
    `<meta property="og:image" content="${sI}"><meta property="og:image:secure_url" content="${sI}">` +
    (big && !/ytimg\.com/.test(image) ? `<meta property="og:image:type" content="image/jpeg"><meta property="og:image:width" content="800"><meta property="og:image:height" content="420">` : "") +
    `<meta property="og:url" content="${sU}"><meta name="twitter:image" content="${sI}">`);
  return new Response(html, { status: res.status, headers: res.headers });
};

export const config = { path: "/" };
