import initSqlJs from 'sql.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = path.join(__dirname, 'pipeline.db');

let db = null;
let SQL = null;

export async function initializeDatabase() {
  try {
    SQL = await initSqlJs();
    
    // Carregar banco de dados existente ou criar novo
    let data = null;
    if (fs.existsSync(DB_PATH)) {
      data = fs.readFileSync(DB_PATH);
    }
    
    db = new SQL.Database(data);
    console.log('✅ Database initialized');
    
    // Salvar banco de dados
    saveDatabase();
    return db;
  } catch (err) {
    console.error('❌ Database connection error:', err);
    throw err;
  }
}

function saveDatabase() {
  try {
    if (db) {
      const data = db.export();
      const buffer = Buffer.from(data);
      fs.writeFileSync(DB_PATH, buffer);
    }
  } catch (err) {
    console.error('❌ Error saving database:', err);
  }
}

export async function queryDatabase(sql) {
  try {
    if (!db) {
      throw new Error('Database not initialized');
    }
    
    const stmt = db.prepare(sql);
    const rows = [];
    
    while (stmt.step()) {
      rows.push(stmt.getAsObject());
    }
    stmt.free();
    
    saveDatabase();
    return rows || [];
  } catch (err) {
    console.error('❌ Query error:', err);
    throw err;
  }
}

export async function getAllTables() {
  try {
    if (!db) {
      throw new Error('Database not initialized');
    }
    
    const sql = "SELECT name FROM sqlite_master WHERE type='table'";
    const stmt = db.prepare(sql);
    const rows = [];
    
    while (stmt.step()) {
      rows.push(stmt.getAsObject());
    }
    stmt.free();
    
    return rows.map(r => r.name);
  } catch (err) {
    console.error('❌ Error getting tables:', err);
    throw err;
  }
}

export async function getTableSchema(tableName) {
  try {
    if (!db) {
      throw new Error('Database not initialized');
    }
    
    const sql = `PRAGMA table_info(${tableName})`;
    const stmt = db.prepare(sql);
    const rows = [];
    
    while (stmt.step()) {
      rows.push(stmt.getAsObject());
    }
    stmt.free();
    
    return rows || [];
  } catch (err) {
    console.error('❌ Error getting schema:', err);
    throw err;
  }
}
