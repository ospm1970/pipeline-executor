import sqlite3 from 'sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = path.join(__dirname, 'pipeline.db');

let db = null;

export async function initializeDatabase() {
  return new Promise((resolve, reject) => {
    db = new sqlite3.Database(DB_PATH, (err) => {
      if (err) {
        console.error('❌ Database connection error:', err);
        reject(err);
      } else {
        console.log('✅ Database initialized');
        resolve();
      }
    });
  });
}

export async function queryDatabase(sql) {
  return new Promise((resolve, reject) => {
    if (!db) {
      reject(new Error('Database not initialized'));
      return;
    }

    db.all(sql, [], (err, rows) => {
      if (err) {
        reject(err);
      } else {
        resolve(rows || []);
      }
    });
  });
}

export async function getAllTables() {
  return new Promise((resolve, reject) => {
    if (!db) {
      reject(new Error('Database not initialized'));
      return;
    }

    db.all("SELECT name FROM sqlite_master WHERE type='table'", [], (err, rows) => {
      if (err) {
        reject(err);
      } else {
        resolve(rows.map(r => r.name));
      }
    });
  });
}

export async function getTableSchema(tableName) {
  return new Promise((resolve, reject) => {
    if (!db) {
      reject(new Error('Database not initialized'));
      return;
    }

    db.all(`PRAGMA table_info(${tableName})`, [], (err, rows) => {
      if (err) {
        reject(err);
      } else {
        resolve(rows || []);
      }
    });
  });
}
