import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

async function main() {
  const dir = path.dirname(fileURLToPath(import.meta.url));
  const sql = fs.readFileSync(path.join(dir, '..', 'migrations', '001_initial.sql'), 'utf-8');
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  await pool.query(sql);
  console.error('Migration 001_initial applied successfully');
  await pool.end();
}

main().catch(err => {
  console.error('Migration failed:', err);
  process.exit(1);
});
