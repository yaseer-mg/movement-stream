const crypto = require('node:crypto');
const { env } = require('../config/env');

// ============================================================
// social.service.js
// Posts stream notifications + event reminders to Facebook,
// X/Twitter, and WhatsApp.
//
// IMPORTANT: Every exported function is fire-and-forget — it
// catches its own errors internally and NEVER throws. Route
// handlers must never await these (call with .catch()).
// ============================================================

// ─── OAuth 1.0a signing (X/Twitter API v1.1 media needs this) ───
// X API v2 OAuth 2.0 bearer flow is used for tweets, but the
// signature method below is kept in case a v1.1 endpoint is needed.
function percentEncode(str) {
  return encodeURIComponent(str).replace(/[!'()*]/g, (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase());
}

function buildOAuth1Header({ method, url, params }) {
  const t = env.social.twitter;
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const nonce = crypto.randomBytes(16).toString('hex');

  const oauthParams = {
    oauth_consumer_key: t.apiKey,
    oauth_nonce: nonce,
    oauth_signature_method: 'HMAC-SHA1',
    oauth_timestamp: timestamp,
    oauth_token: t.accessToken,
    oauth_version: '1.0',
  };

  const allParams = { ...params, ...oauthParams };

  const parameterString = Object.keys(allParams)
    .map((k) => `${percentEncode(k)}=${percentEncode(allParams[k])}`)
    .sort()
    .join('&');

  const signatureBase = [
    method.toUpperCase(),
    percentEncode(url),
    percentEncode(parameterString),
  ].join('&');

  const signingKey = `${percentEncode(t.apiSecret)}&${percentEncode(t.accessSecret)}`;
  const signature = crypto.createHmac('sha1', signingKey).update(signatureBase).digest('base64');

  const header = Object.entries({
    ...oauthParams,
    oauth_signature: signature,
  })
    .map(([k, v]) => `${percentEncode(k)}="${percentEncode(v)}"`)
    .join(', ');

  return `OAuth ${header}`;
}

// ─── Low-level helpers (each returns a promise, never rejects) ───

async function postToFacebook(message) {
  const { pageId, accessToken } = env.social.facebook;
  if (!pageId || !accessToken) {
    console.log('Facebook not configured — skipping post');
    return;
  }

  const res = await fetch(`https://graph.facebook.com/v18.0/${pageId}/feed`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, access_token: accessToken }),
  });

  if (!res.ok) {
    throw new Error(`Facebook API error ${res.status}: ${await res.text()}`);
  }
}

async function postToTwitter(message) {
  const t = env.social.twitter;
  if (!t.apiKey || !t.apiSecret || !t.accessToken || !t.accessSecret) {
    console.log('Twitter not configured — skipping post');
    return;
  }

  // Twitter API v2 (OAuth 1.0a user context)
  const url = 'https://api.twitter.com/2/tweets';
  const authHeader = buildOAuth1Header({
    method: 'POST',
    url,
    params: {},
  });

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: authHeader,
    },
    body: JSON.stringify({ text: message }),
  });

  if (!res.ok) {
    throw new Error(`Twitter API error ${res.status}: ${await res.text()}`);
  }
}

async function broadcastWhatsApp(message) {
  const w = env.social.whatsapp;
  const recipients = (w.recipients || []).filter(Boolean);
  if (!w.phoneNumberId || !w.accessToken || recipients.length === 0) {
    console.log('WhatsApp not configured (or no recipients) — skipping broadcast');
    return;
  }

  const base = `https://graph.facebook.com/${w.apiVersion}/${w.phoneNumberId}/messages`;

  for (const to of recipients) {
    const res = await fetch(base, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${w.accessToken}`,
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to,
        type: 'text',
        text: { body: message },
      }),
    });

    if (!res.ok) {
      throw new Error(`WhatsApp API error ${res.status}: ${await res.text()}`);
    }
  }
}

// Runs every provider and swallows individual failures.
// The returned promise never rejects.
async function postEverywhere(message) {
  await Promise.allSettled([
    postToFacebook(message),
    postToTwitter(message),
    broadcastWhatsApp(message),
  ]);
}

// ─── Public API (all fire-and-forget, never throw) ───

async function notifyStreamStart(streamTitle, streamUrl) {
  await postEverywhere(`We are LIVE now! ${streamTitle} — Watch: ${streamUrl}`);
}

async function notifyStreamEnd(recordingUrl) {
  await postEverywhere(`The stream has ended. Watch the recording: ${recordingUrl}`);
}

async function postEventReminder(event) {
  const startsAt = new Date(event.starts_at).toLocaleString('en-GB', {
    dateStyle: 'full',
    timeStyle: 'short',
    timeZone: env.social.timezone || 'Africa/Lagos',
  });
  const location = event.location ? ` — ${event.location}` : '';
  await postEverywhere(`Upcoming: ${event.title}${location}. Starts ${startsAt}.`);
}

module.exports = { notifyStreamStart, notifyStreamEnd, postEventReminder };
