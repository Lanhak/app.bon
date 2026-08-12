const { Pool } = require('pg');
const url = process.env.DATABASE_URL;
if (!url) { console.error('DATABASE_URL is missing'); process.exit(1); }
const pool = new Pool({
  connectionString: url,
  ssl: String(process.env.PGSSL || 'true').toLowerCase() !== 'false' ? {rejectUnauthorized:false} : undefined,
  connectionTimeoutMillis: 8000
});
(async()=>{
  try {
    const r=await pool.query('SELECT current_database() database, current_user username, NOW() now');
    console.log('POSTGRES OK');
    console.table(r.rows);
  } catch(e) {
    console.error('POSTGRES ERROR:', e.message);
    process.exitCode=1;
  } finally { await pool.end(); }
})();
