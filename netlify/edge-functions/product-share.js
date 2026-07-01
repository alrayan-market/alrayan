// Netlify Edge Function: generates dynamic Open Graph tags per product
// so WhatsApp/Facebook show the correct product image when sharing a link
// like https://yoursite.netlify.app/p/PRODUCT_ID

const FIREBASE_PROJECT_ID = "alrayan-15db4";
const FIREBASE_API_KEY = "AIzaSyC7-MKB7Ix3k0gA7tGxCXNFaty5IQ-U3Xg";

export default async (request, context) => {
  const url = new URL(request.url);
  // expects path like /p/<productId>
  const parts = url.pathname.split("/").filter(Boolean);
  const productId = parts[1];

  if (!productId) {
    return context.next();
  }

  // Detect if this is a bot/crawler (WhatsApp, Facebook, Twitter) or a real browser
  const userAgent = (request.headers.get("user-agent") || "").toLowerCase();
  const isBot = /whatsapp|facebookexternalhit|twitterbot|telegrambot|linkedinbot|slackbot|discordbot|googlebot|bingbot|skypeuripreview/.test(userAgent);

  // For real users, just redirect to the main app with ?product= param
  if (!isBot) {
    const redirectUrl = new URL("/", url.origin);
    redirectUrl.searchParams.set("product", productId);
    return Response.redirect(redirectUrl.toString(), 302);
  }

  // For bots/crawlers, fetch the product from Firestore REST API and build meta tags
  try {
    const firestoreUrl = `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}/databases/(default)/documents/products/${productId}?key=${FIREBASE_API_KEY}`;
    const res = await fetch(firestoreUrl);

    if (!res.ok) {
      return context.next();
    }

    const doc = await res.json();
    const fields = doc.fields || {};

    const name = fields.name?.stringValue || "منتج على منصة الريان";
    const price = fields.price?.doubleValue || fields.price?.integerValue || 0;
    const desc = fields.desc?.stringValue || "";
    const image = fields.image?.stringValue || "";
    const sellerName = fields.sellerName?.stringValue || "";

    const priceFormatted = Number(price).toLocaleString("ar") + " ج.س";
    const title = `${name} — ${priceFormatted}`;
    const description = desc
      ? `${desc} | من متجر ${sellerName} على منصة الريان 🛒`
      : `من متجر ${sellerName} على منصة الريان — السوق السوداني الموثوق 🛒🇸🇩`;

    const pageUrl = `${url.origin}/p/${productId}`;
    const redirectTarget = `${url.origin}/?product=${productId}`;

    const html = `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
<meta charset="UTF-8">
<title>${escapeHtml(title)}</title>
<meta property="og:title" content="${escapeHtml(title)}">
<meta property="og:description" content="${escapeHtml(description)}">
<meta property="og:image" content="${escapeHtml(image)}">
<meta property="og:url" content="${escapeHtml(pageUrl)}">
<meta property="og:type" content="product">
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
  } catch (err) {
    return context.next();
  }
};

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

export const config = {
  path: "/p/*",
};
