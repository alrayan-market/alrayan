// Netlify Function: sends a real push notification to a browser subscription
// using the standard Web Push protocol (VAPID). The VAPID private key stays
// safely on the server (Netlify environment variable) and is never exposed
// to the browser.

const webpush = require("web-push");

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  try {
    const { subscription, title, body, url } = JSON.parse(event.body || "{}");

    if (!subscription || !subscription.endpoint) {
      return { statusCode: 400, body: JSON.stringify({ error: "missing subscription" }) };
    }

    const publicKey = process.env.VAPID_PUBLIC_KEY;
    const privateKey = process.env.VAPID_PRIVATE_KEY;

    if (!publicKey || !privateKey) {
      return { statusCode: 500, body: JSON.stringify({ error: "VAPID keys not configured" }) };
    }

    webpush.setVapidDetails("mailto:support@alrayanmarket.app", publicKey, privateKey);

    const payload = JSON.stringify({
      title: title || "منصة الريان",
      body: body || "لديك إشعار جديد",
      url: url || "/",
    });

    await webpush.sendNotification(subscription, payload);

    return { statusCode: 200, body: JSON.stringify({ success: true }) };
  } catch (err) {
    return { statusCode: 200, body: JSON.stringify({ success: false, error: err.message }) };
  }
};
