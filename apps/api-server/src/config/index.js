// src/config/index.js
// ============================================================
// Loads all environment variables.
// Every other file imports from here — never from process.env
// directly. If a required variable is missing the server
// refuses to start.
// ============================================================

require('dotenv').config();

function required(key) {
  const value = process.env[key];
  if (!value) {
    throw new Error(`❌ Missing required environment variable: ${key}`);
  }
  return value;
}

function optional(key, fallback) {
  return process.env[key] ?? fallback;
}

const config = {
  // Server
  port:    parseInt(optional('PORT', '4000'), 10),
  nodeEnv: optional('NODE_ENV', 'development'),
  isDev:   optional('NODE_ENV', 'development') === 'development',

  // Database
  db: {
    host:     optional('DB_HOST', 'localhost'),
    port:     parseInt(optional('DB_PORT', '5432'), 10),
    name:     required('DB_NAME'),
    user:     required('DB_USER'),
    password: required('DB_PASSWORD'),
  },

  // JWT
  jwt: {
    accessSecret:     required('JWT_ACCESS_SECRET'),
    refreshSecret:    required('JWT_REFRESH_SECRET'),
    accessExpiresIn:  optional('JWT_ACCESS_EXPIRES_IN', '15m'),
    refreshExpiresIn: optional('JWT_REFRESH_EXPIRES_IN', '7d'),
  },

  // AWS S3
  s3: {
    accessKeyId:     optional('AWS_ACCESS_KEY_ID', ''),
    secretAccessKey: optional('AWS_SECRET_ACCESS_KEY', ''),
    region:          optional('AWS_REGION', 'eu-west-1'),
    bucket:          optional('AWS_S3_BUCKET', 'movement-recordings'),
  },

  // Media Server
  mediaServer: {
    url:    optional('MEDIA_SERVER_URL', 'http://localhost:3001'),
    secret: optional('MEDIA_SERVER_SECRET', 'dev-secret'),
  },

  // Social Media
  social: {
    streamPublicUrl: optional('STREAM_PUBLIC_URL', 'http://localhost:5173'),
    timezone:        optional('SOCIAL_TIMEZONE', 'Africa/Lagos'),
    facebook: {
      pageId:      optional('FACEBOOK_PAGE_ID', ''),
      accessToken: optional('FACEBOOK_ACCESS_TOKEN', ''),
    },
    whatsapp: {
      phoneNumberId: optional('WHATSAPP_PHONE_NUMBER_ID', ''),
      accessToken:   optional('WHATSAPP_ACCESS_TOKEN', ''),
      apiVersion:    optional('WHATSAPP_API_VERSION', 'v17.0'),
      recipients:    optional('WHATSAPP_RECIPIENTS', '').split(',').map((s) => s.trim()).filter(Boolean),
    },
    twitter: {
      apiKey:       optional('TWITTER_API_KEY', ''),
      apiSecret:    optional('TWITTER_API_SECRET', ''),
      accessToken:  optional('TWITTER_ACCESS_TOKEN', ''),
      accessSecret: optional('TWITTER_ACCESS_SECRET', ''),
    },
  },

  // Cron jobs
  cron: {
    eventReminder: optional('CRON_EVENT_REMINDER', '0 8 * * *'),
  },

  // CORS
  corsOrigin: optional('CORS_ORIGIN', 'http://localhost:5173'),
};

module.exports = { config };