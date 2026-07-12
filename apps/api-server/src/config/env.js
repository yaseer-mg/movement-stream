const path = require('node:path');

require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });
require('dotenv').config();

function toNumber(value, fallback) {
  if (!value) {
    return fallback;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function required(key) {
  const value = process.env[key];
  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
}

function databaseUrl() {
  if (process.env.DATABASE_URL) {
    return process.env.DATABASE_URL;
  }

  const host = process.env.DB_HOST ?? 'localhost';
  const port = process.env.DB_PORT ?? '5432';
  const name = required('DB_NAME');
  const user = required('DB_USER');
  const password = required('DB_PASSWORD');

  return `postgres://${encodeURIComponent(user)}:${encodeURIComponent(password)}@${host}:${port}/${name}`;
}

const env = {
  nodeEnv: process.env.NODE_ENV ?? 'development',
  port: toNumber(process.env.PORT, 4000),
  host: process.env.HOST ?? '127.0.0.1',
  databaseUrl: databaseUrl(),
  corsOrigin: process.env.CORS_ORIGIN ?? 'http://localhost:3000',
  jwt: {
    accessSecret: required('JWT_ACCESS_SECRET'),
    refreshSecret: required('JWT_REFRESH_SECRET'),
    accessExpiresIn: process.env.JWT_ACCESS_EXPIRES_IN ?? '15m',
    refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN ?? '7d',
  },
  mediaServer: {
    url: process.env.MEDIA_SERVER_URL ?? 'http://localhost:3001',
    secret: process.env.MEDIA_SERVER_SECRET ?? 'dev-secret',
  },
  s3: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID ?? '',
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY ?? '',
    region: process.env.AWS_REGION ?? 'eu-west-1',
    bucket: process.env.AWS_S3_BUCKET ?? 'movement-recordings',
  },
  n8n: {
    streamStartWebhook: process.env.N8N_STREAM_START_WEBHOOK ?? '',
    streamEndWebhook: process.env.N8N_STREAM_END_WEBHOOK ?? '',
  },
};

module.exports = { env };
