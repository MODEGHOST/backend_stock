// src/routes/sale.route.js
import express from "express";
import {
  createSaleController,
  getSalesSummary,
  getSalesCommissions,
} from "../controllers/sale.controller.js";
import requireAuth from "../middleware/auth.js";

const router = express.Router();

router.post("/", requireAuth, createSaleController);
router.get("/summary", requireAuth, getSalesSummary);
router.get("/commissions", requireAuth, getSalesCommissions);

export default router;
