// src/services/auth.service.js
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { pool } from '../config/db.js'
import HttpError from '../utils/httpError.js'

export async function findUserByEmail(emailRaw) {
  try {
    const email = String(emailRaw || '').trim().toLowerCase();

    const [rows] = await pool.query(
      `
      SELECT 
        u.id,
        u.company_id,
        c.name AS company_name,
        u.first_name,
        u.last_name,
        u.phone,
        u.email,
        u.role,
        u.is_active,
        u.password_hash
      FROM users u
      LEFT JOIN companies c ON u.company_id = c.id
      WHERE u.email = ? 
      LIMIT 1
      `,
      [email]
    );

    return rows[0] || null;
  } catch (err) {
    console.error("❌ [findUserByEmail error]:", err);
    throw err;
  }
}


export async function createUser(data) {
  const email = String(data.email || '').trim().toLowerCase()
  const exists = await findUserByEmail(email)
  if (exists) throw new HttpError(409, 'อีเมลนี้ถูกใช้งานแล้ว')

  const hash = await bcrypt.hash(String(data.password || ''), 10)
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
  )
  const created = await findUserByEmail(email)
  if (!created) throw new HttpError(500, 'Cannot fetch created user')
  const safeUser = { ...created }
  delete safeUser.password_hash
  return { id: result.insertId, user: safeUser }
}

export function signAccessToken(user) {
  const first = user.first_name || ''
  const last = user.last_name || ''
  const name = `${first} ${last}`.trim()
  const payload = {
    id: user.id,
    email: user.email,
    role: user.role,
    name,
    company_id: user.company_id ?? null
  }
  return jwt.sign(payload, process.env.JWT_ACCESS_SECRET, {
    algorithm: 'HS256',
    expiresIn: process.env.JWT_ACCESS_EXPIRES || '2h'
  })
}
