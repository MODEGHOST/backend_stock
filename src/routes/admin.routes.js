// src/routes/admin.routes.js
import { Router } from "express";
import requireAuth from "../middleware/auth.js";
import { requireRole } from "../middleware/requireRole.js";
import { adminCreateUserController } from "../controllers/admin.controller.js";

const router = Router();

// system_owner เท่านั้น
router.post("/users", requireAuth, requireRole("system_owner"), adminCreateUserController);

export default router;