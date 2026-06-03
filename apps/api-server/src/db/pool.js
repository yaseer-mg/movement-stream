const pg = require('pg');

const { env } = require('../config/env');

const pool = new pg.Pool({
  connectionString: env.databaseUrl,
});

async function closePool() {
  await pool.end();
}

module.exports = { pool, closePool };
