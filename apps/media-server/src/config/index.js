const path = require('node:path');

require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });
require('dotenv').config();

function required(key) {
  const value = process.env[key];
  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
}

function optional(key, fallback) {
  return process.env[key] ?? fallback;
}

const config = {
  port: parseInt(optional('PORT', '3001'), 10),
  nodeEnv: optional('NODE_ENV', 'development'),
  isDev: optional('NODE_ENV', 'development') === 'development',

  apiServer: {
    url: optional('API_SERVER_URL', 'http://localhost:4000'),
    secret: required('API_SERVER_SECRET'),
  },

  hls: {
    outputPath: optional('HLS_OUTPUT_PATH', '/var/hls'),
  },

  recordings: {
    tempPath: optional('RECORDINGS_TEMP_PATH', '/var/recordings'),
  },

  s3: {
    accessKeyId: optional('AWS_ACCESS_KEY_ID', ''),
    secretAccessKey: optional('AWS_SECRET_ACCESS_KEY', ''),
    region: optional('AWS_REGION', 'eu-west-1'),
    bucket: optional('AWS_S3_BUCKET', 'movement-recordings'),
  },
};

module.exports = { config };
