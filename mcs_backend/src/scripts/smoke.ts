import { pool } from '../db.js';
import { config } from '../config.js';
try { const [rows] = await pool.query('SELECT DATABASE() AS database_name, 1 AS connected'); console.log(JSON.stringify({ ok: true, port: config.port, database: rows }, null, 2)); await pool.end(); } catch (error) { console.error(error); await pool.end(); process.exitCode = 1; }
