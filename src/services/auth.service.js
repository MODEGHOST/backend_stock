import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { pool } from '../config/db.js';
import HttpError from '../utils/httpError.js';

export async function findUserByEmail(emailRaw) {
  const email = String(emailRaw || '').trim().toLowerCase();
  const [rows] = await pool.query(
    `SELECT id, company_id, first_name, last_name, phone, email, role, is_active, password_hash
     FROM users WHERE email = ? LIMIT 1`,
    [email]
  );
  return rows[0] || null;
}

export async function createUser(data) {
  const email = String(data.email || '').trim().toLowerCase();
  const exists = await findUserByEmail(email);
  if (exists) throw new HttpError(409, 'อีเมลนี้ถูกใช้งานแล้ว');

  const hash = await bcrypt.hash(String(data.password || ''), 10);

  const [result] = await pool.query(
    `INSERT INTO users (company_id, first_name, last_name, phone, email, password_hash)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [
      data.company_id ?? null,
      String(data.first_name || '').trim(),
      String(data.last_name || '').trim(),
      String(data.phone || '').trim(),
      email,
      hash
    ]
  );

  const created = await findUserByEmail(email);
  return { id: result.insertId, user: created };
}

export function signAccessToken(user) {
  const first = user.first_name || '';
  const last  = user.last_name || '';
  const name  = `${first} ${last}`.trim();

  const payload = {
    id: user.id,
    email: user.email,
    role: user.role,
    name,
    company_id: user.company_id ?? null
  };

  return jwt.sign(payload, process.env.JWT_ACCESS_SECRET, {
    algorithm: 'HS256',
    expiresIn: process.env.JWT_ACCESS_EXPIRES || '2h'
  });
}
