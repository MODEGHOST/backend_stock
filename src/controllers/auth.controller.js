// src/controllers/auth.controller.js
import HttpError from "../utils/httpError.js";
import { z } from "zod";
import { createUser, signAccessToken, findUserByEmail } from "../services/auth.service.js";
import bcrypt from "bcryptjs";

const toIntOrUndef = (v) => {
  if (v === "" || v === undefined) return undefined;
  if (v === null) return null;
  const n = Number(v);
  return Number.isNaN(n) ? v : n;
};

const registerSchema = z.object({
  first_name: z.string().min(1),
  last_name: z.string().min(1),
  phone: z.string().min(6),
  email: z.string().email(),
  password: z.string().min(6),

  // สำหรับ public register: ต้องเลือกบริษัท (ตามที่คุณทำ SaaS แบบหลายบริษัท)
  company_id: z.preprocess(toIntOrUndef, z.number().int().positive()),
});

export async function registerController(req, res) {
  try {
    const data = registerSchema.parse(req.body);

    // 🔒 public register บังคับเป็น user เท่านั้น
    const created = await createUser({
      ...data,
      role: "user",
    });

    const user = created.user || created;
    const token = signAccessToken(user);

    res.status(201).json({ accessToken: token, user });
  } catch (err) {
    console.error("❌ [registerController error]:", err);
    res.status(err.status || 400).json({ error: err?.message || "Register failed" });
  }
}

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export async function loginController(req, res) {
  try {
    const { email, password } = loginSchema.parse(req.body);

    const userWithHash = await findUserByEmail(String(email).toLowerCase());
    if (!userWithHash) throw new HttpError(401, "อีเมลหรือรหัสผ่านไม่ถูกต้อง");

    if (String(userWithHash.is_active) === "0") {
      throw new HttpError(403, "บัญชีถูกปิดการใช้งาน");
    }

    const ok = await bcrypt.compare(String(password), String(userWithHash.password_hash || ""));
    if (!ok) throw new HttpError(401, "อีเมลหรือรหัสผ่านไม่ถูกต้อง");

    const safeUser = { ...userWithHash };
    delete safeUser.password_hash;

    const token = signAccessToken(safeUser);
    res.json({ accessToken: token, user: safeUser });
  } catch (err) {
    console.error("❌ [loginController error]:", err);
    res.status(err.status || 500).json({ error: err.message || "Login failed" });
  }
}

export async function meController(req, res) {
  const { id, email, role, name, company_id } = req.user || {};
  res.json({ user: { id, email, role, name, company_id } });
}
