// netlify/edge-functions/channel-share.js
// معاينة الروابط عند المشاركة (واتساب، فيسبوك، تيليجرام...)
// تعمل لبوتات المعاينة فقط، ولا تغيّر شيئاً للزائر العادي.
// الروابط المدعومة: ?p= خزان · ?calc= حاسبة · ?quote= عرض سعر · ?join= انضمام · ?rc= إيصال صرف · ?dn= إشعار تسليم · ?rv= تقييم · ?old= زبون سابق · ?m= صفحة المسوّق · الرئيسية بدون رابط · (القديمة: ?prop= ?req= ?ad= ?auc=)

const FIREBASE_PROJECT_ID = "alrayan-15db4";
const FIREBASE_API_KEY = "AIzaSyC7-MKB7Ix3k0gA7tGxCXNFaty5IQ-U3Xg";
const SITE_LOGO = "https://alrayanmarket.netlify.app/icon-512.png";
const SITE_NAME = "💧 منصة الريان لخزانات المياه";
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

function mapStr(f, k, sub) { try { return f[k].mapValue.fields[sub].stringValue || ""; } catch (e) { return ""; } }
let OG_CACHE = null;
async function staticOg(key) {
  if (!OG_CACHE) OG_CACHE = (await fireGet("meta", "tankSettings")) || {};
  return mapStr(OG_CACHE, "og", key);
}
function firstItemPid(f) { try { return f.items.arrayValue.values[0].mapValue.fields.productId.stringValue || ""; } catch (e) { return ""; } }

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
  const tk = p("p"), calc = p("calc"), quote = p("quote"), join = p("join"), rc = p("rc"), dn = p("dn"), rv = p("rv"), old = p("old"), mk = p("m");
  const auc = p("auc"), prop = p("prop"), req = p("req"), ad = p("ad"), vid = p("video"), poll = p("poll"), publish = p("publish");
  if (!BOT.test(ua)) return context.next();
  const home = !tk && !calc && !quote && !join && !rc && !dn && !rv && !old && !mk && !auc && !prop && !req && !ad && !vid && !poll && !publish;
  if (home && [...url.searchParams.keys()].some((k) => !["s", "v", "fbclid", "utm_source", "utm_medium", "utm_campaign"].includes(k))) return context.next();

  let ready = false; // صورة المعاينة جاهزة بالحجم المناسب (لا تحتاج تصغير)
  let title = SITE_NAME, desc = "أطلب من هنا واستلم في موقعك · خزانات أصلية بكل السعات · الدفع عند الاستلام", image = SITE_LOGO;
  try {
    const useStatic = async (key) => { const u = await staticOg(key); if (u) { image = u; ready = true; } };
    if (home) {
      await useStatic("home");
    } else if (mk) {
      title = "📊 صفحة المسوّق · منصة الريان لخزانات المياه";
      desc = "تابع زياراتك وطلباتك وعمولاتك، واطلب صرفها متى شئت";
      await useStatic("mk");
    } else if (tk) {
      const f = await fireGet("products", tk);
      if (f) {
        const name = str(f, "name");
        let cap = num(f, "capacity");
        if (!cap) { const m = name.replace(/[,٬]/g, "").match(/(\d{3,6})\s*(?:لتر|ليتر)/); if (m) cap = Number(m[1]); }
        const price = (f.priceOnRequest && f.priceOnRequest.booleanValue) ? "السعر عند الطلب" : (money(num(f, "price")) || "السعر عند الطلب");
        title = "💧 " + (name || "خزان مياه");
        desc = [cap ? "السعة " + cap.toLocaleString("en-US") + " لتر" : "", price, "أطلب من هنا واستلم في موقعك"].filter(Boolean).join(" · ");
        const og = str(f, "ogImage"), img = firstImg(f, "image", "images");
        if (og) { image = og; ready = true; } else if (img) image = img;
      }
    } else if (calc) {
      title = "🧮 أي خزان يناسب بيتك؟";
      desc = "اكتب عدد أفراد البيت وأيام انقطاع المياه، ونقترح لك السعة المناسبة · منصة الريان لخزانات المياه";
      await useStatic("calc");
    } else if (rc) {
      const f = await fireGet("receipts", rc);
      if (f) {
        title = "🧾 تم صرف " + (money(num(f, "amount")) || "عمولة") + " · منصة الريان";
        desc = "إيصال صرف عمولة تسويق لـ " + str(f, "name") + " عن " + num(f, "count") + " طلب ✓ · سوّق معنا واكسب عمولة على كل خزان";
        const og = str(f, "ogImg"); if (og) { image = og; ready = true; }
      }
    } else if (old) {
      title = "🌷 اشتريت منّا خزان قبل كده؟ · منصة الريان";
      desc = "سجّل بياناتك وقيّم تجربتك — رأيك يساعد غيرك يختار خزانه 💧";
      await useStatic("old");
    } else if (rv) {
      title = "⭐ قيّم طلبك · منصة الريان لخزانات المياه";
      desc = "رأيك يهمنا ويساعد غيرك يختار خزانه — التقييم يأخذ 10 ثوانٍ فقط";
      const f = await fireGet("orders", rv);
      if (f) {
        const og = str(f, "ogRv");
        if (og) { image = og; ready = true; }
        else { const pid = firstItemPid(f); if (pid) { const pf = await fireGet("products", pid); if (pf) { const im = firstImg(pf, "image", "images"); if (im) image = im; } } }
      }
    } else if (dn) {
      const f = await fireGet("orders", dn);
      if (f && str(f, "status") === "delivered") {
        title = "✅ تم تسليم الطلب " + dn + " · منصة الريان";
        desc = "تم توصيل الخزان إلى " + (str(f, "city") || "موقع العميل") + " بنجاح 💧 أطلب من هنا واستلم في موقعك";
        const og = str(f, "ogImg"); if (og) { image = og; ready = true; }
      }
    } else if (join) {
      title = "🤝 اكسب معنا · منصة الريان لخزانات المياه";
      desc = "شارك روابط خزاناتنا واكسب عمولة على كل خزان يُطلب عن طريقك، وتطلب صرفها على بنكك متى شئت";
      await useStatic("join");
    } else if (quote) {
      title = "🏗️ عرض سعر خاص للكميات";
      desc = "للمقاولين والمشاريع والتجار · خزانات مياه بكل السعات · منصة الريان لخزانات المياه";
      await useStatic("quote");
    } else if (auc) {
      const f = await fireGet("auctions", auc);
      if (f) {
        const hb = num(f, "highestBid");
        title = "🔨 مزاد: " + (str(f, "title") || "");
        desc = [str(f, "city"), hb ? "أعلى مزايدة " + money(hb) : "بلا سعر افتتاحي", "زايد الآن على منصة الريان"].filter(Boolean).join(" · ");
        const og = str(f, "ogImage"), img = firstImg(f, "image", "images");
        if (og) { image = og; ready = true; } else if (img) image = img;
      }
    } else if (prop) {
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
        const og = str(f, "ogImage");
        const img = firstImg(f, "image", "images");
        if (og) { image = og; ready = true; } else if (img) image = img;
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
        auction: ["🔨 اعرض للمزاد على منصة الريان", "عقارك أو سيارتك تصل لأعلى سعر عبر مزاد موثّق بإشراف المنصة"],
        request: ["🔎 اطلب ما تبحث عنه", "تدوّر على عقار أو عربية؟ اكتب طلبك ويجيك أصحاب العروض على واتساب"]
      }[publish];
      if (T) { title = T[0]; desc = T[1]; }
    }
  } catch (e) { return context.next(); }

  const res = await context.next();
  let html = await res.text();
  const big = image !== SITE_LOGO;
  const finalImg = ready ? image : ogImg(image);
  const sT = esc(title), sD = esc(desc.slice(0, 200)), sI = esc(finalImg), sU = esc(url.toString());
  html = html.replace(/<title>.*?<\/title>/, `<title>${sT}</title>`);
  html = html.replace(/<meta property="og:title" content=".*?">/, `<meta property="og:title" content="${sT}">`);
  html = html.replace(/<meta property="og:description" content=".*?">/, `<meta property="og:description" content="${sD}">`);
  html = html.replace(/<meta property="og:image" content=".*?">/,
    `<meta property="og:image" content="${sI}"><meta property="og:image:secure_url" content="${sI}">` +
    (big && !/ytimg\.com/.test(image) ? `<meta property="og:image:type" content="image/jpeg"><meta property="og:image:width" content="${ready ? 1200 : 800}"><meta property="og:image:height" content="${ready ? 630 : 420}">` : "") +
    `<meta property="og:image:alt" content="${sT}"><meta property="og:url" content="${sU}"><meta property="og:site_name" content="منصة الريان لخزانات المياه"><meta property="og:locale" content="ar_AR">` +
    `<meta name="twitter:title" content="${sT}"><meta name="twitter:description" content="${sD}"><meta name="twitter:image" content="${sI}">`);
  return new Response(html, { status: res.status, headers: res.headers });
};

export const config = { path: "/" };
