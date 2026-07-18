/**
 * Migration Runner — line-sales-bot
 *
 * Usage:
 *   node database/migrate.js          <- run pending migrations
 *   node database/migrate.js --status <- show status
 */

require('dotenv').config();
const { Pool } = require('pg');
const fs   = require('fs');
const path = require('path');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
});

// Scan both root-level migration files and sql/ folder
const MIGRATION_DIRS = [
  __dirname + '/..',          // D:\line-sales-bot\ (migration_v1.sql etc.)
  path.join(__dirname, '../sql'),
];

function getMigrationFiles() {
  const files = [];
  for (const dir of MIGRATION_DIRS) {
    if (!fs.existsSync(dir)) continue;
    const entries = fs.readdirSync(dir)
      .filter(f => /^migration_v\d+\.sql$/i.test(f))
      .map(f => ({ filename: f, fullPath: path.join(dir, f) }));
    files.push(...entries);
  }
  // Sort by version number
  files.sort((a, b) => extractVersion(a.filename) - extractVersion(b.filename));
  // Deduplicate (prefer sql/ over root)
  const seen = new Set();
  return files.filter(f => {
    if (seen.has(f.filename)) return false;
    seen.add(f.filename);
    return true;
  });
}

function extractVersion(filename) {
  const m = filename.match(/migration_v(\d+)\.sql/i);
  return m ? parseInt(m[1]) : 0;
}

async function ensureMigrationsTable(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS _migrations (
      id         SERIAL PRIMARY KEY,
      filename   VARCHAR(255) UNIQUE NOT NULL,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
}

async function getApplied(client) {
  const { rows } = await client.query('SELECT filename FROM _migrations');
  return new Set(rows.map(r => r.filename));
}

async function runMigration(client, { filename, fullPath }) {
  const sql = fs.readFileSync(fullPath, 'utf8');
  try {
    await client.query('BEGIN');
    await client.query(sql);
    await client.query(
      'INSERT INTO _migrations (filename) VALUES ($1) ON CONFLICT DO NOTHING',
      [filename]
    );
    await client.query('COMMIT');
    console.log(`  OK  ${filename}`);
  } catch (err) {
    await client.query('ROLLBACK');
    throw new Error(`FAIL ${filename}: ${err.message}`);
  }
}

async function migrate() {
  const isStatus = process.argv.includes('--status');
  const client   = await pool.connect();
  try {
    await ensureMigrationsTable(client);
    const applied  = await getApplied(client);
    const allFiles = getMigrationFiles();
    const pending  = allFiles.filter(f => !applied.has(f.filename));

    if (isStatus) {
      console.log('\nMigration Status');
      console.log('-'.repeat(40));
      for (const f of allFiles) {
        console.log(`  ${applied.has(f.filename) ? 'applied' : 'PENDING'}  ${f.filename}`);
      }
      console.log(`\nTotal: ${allFiles.length} | Applied: ${applied.size} | Pending: ${pending.length}\n`);
      return;
    }

    if (!pending.length) {
      console.log('No pending migrations — database is up to date.');
      return;
    }
    console.log(`\nRunning ${pending.length} migration(s)...\n`);
    for (const file of pending) {
      await runMigration(client, file);
    }
    console.log(`\nDone: ${pending.length} migration(s) applied.`);
  } catch (err) {
    console.error('\n' + err.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

migrate();
