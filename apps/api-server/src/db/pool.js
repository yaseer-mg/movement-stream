const pg = require('pg');

const { env } = require('../config/env');

const pool = new pg.Pool({
  connectionString: env.databaseUrl,
});

async function closePool() {
  await pool.end();
}

async function query(sql, params) {
  const result = await pool.query(sql, params);
  return result.rows;
}

async function queryOne(sql, params) {
  const rows = await query(sql, params);
  return rows[0] ?? null;
}

module.exports = { pool, closePool, query, queryOne };
