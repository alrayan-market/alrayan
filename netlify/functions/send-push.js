const webpush = require('web-push');

// VAPID keys come from Netlify Environment Variables (never hard-code them here)
const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY;
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY;

webpush.setVapidDetails(
  'mailto:admin@alrayan-market.example.com',
  VAPID_PUBLIC_KEY,
  VAPID_PRIVATE_KEY
);

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  try {
    const { subscription, title, body, url, icon } = JSON.parse(event.body);

    if (!subscription || !subscription.endpoint) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Missing or invalid subscription object' })
      };
    }

    const payload = JSON.stringify({
      title: title || 'الريان ماركت',
      body: body || 'لديك إشعار جديد',
      url: url || '/',
      icon: icon || '/icon-192.png'
    });

    await webpush.sendNotification(subscription, payload);

    return {
      statusCode: 200,
      body: JSON.stringify({ success: true })
    };
  } catch (error) {
    console.error('Push send error:', error);

    // 410/404 means the subscription is no longer valid (user unsubscribed, uninstalled, etc.)
    if (error.statusCode === 410 || error.statusCode === 404) {
      return {
        statusCode: 410,
        body: JSON.stringify({ error: 'Subscription expired', expired: true })
      };
    }

    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Failed to send notification' })
    };
  }
};
