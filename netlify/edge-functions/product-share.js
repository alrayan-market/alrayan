// Netlify Edge Function: generates dynamic Open Graph tags so WhatsApp/Facebook
// show the correct image when sharing links like:
//   https://yoursite.netlify.app/p/PRODUCT_ID   -> product image
//   https://yoursite.netlify.app/s/SELLER_ID     -> store logo image

const FIREBASE_PROJECT_ID = "alrayan-15db4";
const FIREBASE_API_KEY = "AIzaSyC7-MKB7Ix3k0gA7tGxCXNFaty5IQ-U3Xg";

export default async (request, context) => {
  const url = new URL(request.url);
  const parts = url.pathname.split("/").filter(Boolean);
  const kind = parts[0]; // "p" for product, "s" for store
  const id = parts[1];

  if (!id) {
    return context.next();
  }

  // Detect if this is a bot/crawler (WhatsApp, Facebook, Twitter) or a real browser
  const userAgent = (request.headers.get("user-agent") || "").toLowerCase();
  const isBot = /whatsapp|facebookexternalhit|twitterbot|telegrambot|linkedinbot|slackbot|discordbot|googlebot|bingbot|skypeuripreview/.test(userAgent);

  // For real users, redirect to the main app with the right param
  if (!isBot) {
    const redirectUrl = new URL("/", url.origin);
    if (kind === "s") {
      redirectUrl.searchParams.set("store", id);
    } else {
      redirectUrl.searchParams.set("product", id);
    }
    return Response.redirect(redirectUrl.toString(), 302);
  }

  try {
    if (kind === "s") {
      // ===== STORE SHARE =====
      const firestoreUrl = `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}/databases/(default)/documents/sellers/${id}?key=${FIREBASE_API_KEY}`;
      const res = await fetch(firestoreUrl);
      if (!res.ok) return context.next();

      const doc = await res.json();
      const fields = doc.fields || {};

      const storeName = fields.storeName?.stringValue || "متجر على منصة الريان";
      const category = fields.category?.stringValue || "";
      const city = fields.city?.stringValue || "";
      const description = fields.description?.stringValue || "";
      const storeImage = fields.storeImage?.stringValue || "";

      const title = `${storeName}${category ? " — " + category : ""}`;
      const metaParts = [];
      if (city) metaParts.push("📍 " + city);
      metaParts.push("على منصة الريان — السوق السوداني الموثوق 🛒🇸🇩");
      const desc = description ? `${description} | ${metaParts.join(" · ")}` : metaParts.join(" · ");

      const pageUrl = `${url.origin}/s/${id}`;
      const redirectTarget = `${url.origin}/?store=${id}`;

      return htmlResponse(title, desc, storeImage, pageUrl, redirectTarget);
    } else {
      // ===== PRODUCT SHARE =====
      const firestoreUrl = `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}/databases/(default)/documents/products/${id}?key=${FIREBASE_API_KEY}`;
      const res = await fetch(firestoreUrl);
      if (!res.ok) return context.next();

      const doc = await res.json();
      const fields = doc.fields || {};

      const name = fields.name?.stringValue || "منتج على منصة الريان";
      const priceOnRequest = fields.priceOnRequest?.booleanValue || false;
      const price = fields.price?.doubleValue || fields.price?.integerValue || 0;
      const desc = fields.desc?.stringValue || "";
      const image = fields.image?.stringValue || "";
      const sellerName = fields.sellerName?.stringValue || "";

      const priceFormatted = priceOnRequest ? "السعر عند الطلب" : Number(price).toLocaleString("ar") + " ج.س";
      const title = `${name} — ${priceFormatted}`;
      const description = desc
        ? `${desc} | من متجر ${sellerName} على منصة الريان 🛒`
        : `من متجر ${sellerName} على منصة الريان — السوق السوداني الموثوق 🛒🇸🇩`;

      const pageUrl = `${url.origin}/p/${id}`;
      const redirectTarget = `${url.origin}/?product=${id}`;

      return htmlResponse(title, description, image, pageUrl, redirectTarget);
    }
  } catch (err) {
    return context.next();
  }
};

function htmlResponse(title, description, image, pageUrl, redirectTarget) {
  const html = `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
<meta charset="UTF-8">
<title>${escapeHtml(title)}</title>
<meta property="og:title" content="${escapeHtml(title)}">
<meta property="og:description" content="${escapeHtml(description)}">
<meta property="og:image" content="${escapeHtml(image)}">
<meta property="og:url" content="${escapeHtml(pageUrl)}">
<meta property="og:type" content="website">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${escapeHtml(title)}">
<meta name="twitter:description" content="${escapeHtml(description)}">
<meta name="twitter:image" content="${escapeHtml(image)}">
<meta http-equiv="refresh" content="0; url=${escapeHtml(redirectTarget)}">
</head>
<body>
<p>جاري التحويل لمنصة الريان...</p>
<script>window.location.href = "${redirectTarget}";</script>
</body>
</html>`;
  return new Response(html, {
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

export const config = {
  path: ["/p/*", "/s/*"],
};
