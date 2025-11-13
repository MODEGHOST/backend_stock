import HttpError from '../utils/httpError.js';
import { z } from 'zod';
import { findUserByEmail, createUser, signAccessToken } from "../services/auth.service.js";
import bcrypt from 'bcryptjs';

const registerSchema = z.object({
  first_name: z.string().min(1),
  last_name: z.string().min(1),
  phone: z.string().min(6),
  email: z.string().email(),
  password: z.string().min(6),
  company_id: z.number().optional()
});

export async function registerController(req, res) {
  try {
    const data = registerSchema.parse(req.body);
    const created = await createUser(data);
    const user = created.user || created;
    const token = signAccessToken(user);
    res.status(201).json({ accessToken: token, user });
  } catch (err) {
    res.status(err.status || 400).json({ error: err?.message || 'Register failed' });
  }
}

export async function loginController(req, res) {
  try {
    const { email, password } = req.body;
    if (!email || !password) throw new HttpError(400, 'กรอกข้อมูลให้ครบ');

    const user = await findUserByEmail(email.toLowerCase());
    if (!user) throw new HttpError(401, 'อีเมลหรือรหัสผ่านไม่ถูกต้อง');

    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) throw new HttpError(401, 'อีเมลหรือรหัสผ่านไม่ถูกต้อง');

    res.json({ accessToken: signAccessToken(user), user });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message || "Login failed" });
  }
}

export async function meController(req, res) {
  res.json({ user: req.user });
}
