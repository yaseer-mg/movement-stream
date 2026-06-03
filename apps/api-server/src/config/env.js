require('dotenv').config();

function toNumber(value, fallback) {
  if (!value) {
    return fallback;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

const env = {
  nodeEnv: process.env.NODE_ENV ?? 'development',
  port: toNumber(process.env.PORT, 4000),
  host: process.env.HOST ?? '127.0.0.1',
  databaseUrl:
    process.env.DATABASE_URL ??
    'postgres://postgres:postgres@localhost:5432/movement_stream',
  corsOrigin: process.env.CORS_ORIGIN ?? 'http://localhost:3000',
};

module.exports = { env };
