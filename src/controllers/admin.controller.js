// src/controllers/admin.controller.js
import { z } from "zod";
import HttpError from "../utils/httpError.js";
import { createUser } from "../services/auth.service.js";

const toInt = (v) => {
  const n = Number(v);
  return Number.isNaN(n) ? v : n;
};

const createUserByAdminSchema = z.object({
  first_name: z.string().min(1),
  last_name: z.string().min(1),
  phone: z.string().min(6),
  email: z.string().email(),
  password: z.string().min(6),

  // ✅ อนุญาตแค่ 3 role นี้
  role: z.enum(["owner_company", "admin", "user"]).default("user"),

  // ✅ รองรับส่งมาเป็น "1" ได้ด้วย
  company_id: z.preprocess(toInt, z.number().int().positive()),
});

export async function adminCreateUserController(req, res, next) {
  try {
    // ปกติคุณมี requireRole("system_owner") อยู่แล้ว
    // แต่กันซ้ำได้ (เผื่อ route ลืมใส่ middleware)
    if (req.user?.role !== "system_owner") throw new HttpError(403, "Forbidden");

    const data = createUserByAdminSchema.parse(req.body);

    const created = await createUser({
      ...data,
      // ย้ำให้ชัดว่าต้องผูกบริษัท
      company_id: data.company_id,
      role: data.role,
    });

    res.status(201).json({ ok: true, user: created.user });
  } catch (err) {
    next(err);
  }
}
