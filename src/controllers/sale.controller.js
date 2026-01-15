// src/controllers/sale.controller.js
import { z } from "zod";
import { createSale } from "../services/sale.service.js";
import { pool } from "../config/db.js";

const NZ = (v) => Number(v ?? 0);

const itemSchema = z.object({
  productName: z.string().min(1),
  quantity: z.preprocess(NZ, z.number().min(1)),
  price: z.preprocess(NZ, z.number().min(0)),
  discount: z.preprocess(NZ, z.number().min(0)),        // -> discount_percent
  discountAmount: z.preprocess(NZ, z.number().min(0)),
  taxType: z.string(),
  tax: z.preprocess(NZ, z.number().min(0)),
  beforeTax: z.preprocess(NZ, z.number().min(0)),
  withholdingTax: z.preprocess(NZ, z.number().min(0)),
  total: z.preprocess(NZ, z.number().min(0)),

  // ค่าคอมต่อรายการ
  commissionMode: z.enum(["percent", "amount"]),
  commissionPreset: z.number().int().min(1).max(5).nullable(),
  commissionCustomPercent: z.number().min(0).max(100).nullable(),
  commissionAmountPerUnit: z.preprocess(NZ, z.number().min(0)),
  commissionPerUnit: z.preprocess(NZ, z.number().min(0)),
  commissionTotal: z.preprocess(NZ, z.number().min(0)),
});

const saleSchema = z.object({
  sellerId: z.number(),
  issueDate: z.string(),          // YYYY-MM-DD
  validUntilDate: z.string(),     // YYYY-MM-DD
  totalAmount: z.preprocess(NZ, z.number().min(0)),
  sellerCommissionTotal: z.preprocess(NZ, z.number().min(0)),
  items: z.array(itemSchema).nonempty("ต้องมีสินค้าอย่างน้อย 1 รายการ"),
});

export async function createSaleController(req, res) {
  try {
    const sellerId = req.user?.id || req.body.sellerId;
    if (!sellerId) return res.status(401).json({ error: "ไม่พบข้อมูลผู้ขาย" });

    const parsed = saleSchema.parse({ ...req.body, sellerId });

    // กันชื่อสินค้าซ้ำในบิล (เอาออกได้ถ้าไม่ต้องการ)
    const unique = new Set(parsed.items.map((i) => i.productName));
    if (unique.size !== parsed.items.length) {
      return res.status(400).json({ error: "มีสินค้าชื่อซ้ำในรายการขาย" });
    }

    const sale = await createSale(parsed);
    res.status(201).json({ ok: true, message: "บันทึกการขายสำเร็จ", saleId: sale.id });
  } catch (err) {
    console.error("❌ [createSaleController error]:", err);
    res.status(400).json({
      error: err.errors ? JSON.stringify(err.errors, null, 2) : err.message,
    });
  }
}

// สรุปยอดขายต่อสินค้า + ยอดคอม โดยเลือกช่วงเวลาได้
export async function getSalesSummary(req, res) {
  try {
    const { from, to } = req.query;

    const where = [];
    const params = [];
    if (from) { where.push("s.issue_date >= ?"); params.push(from); }
    if (to)   { where.push("s.issue_date <= ?"); params.push(to); }
    const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

    const [rows] = await pool.query(
      `
      SELECT 
        p.name AS product_name,
        COALESCE(SUM(si.quantity), 0)            AS total_units,
        COALESCE(SUM(si.total), 0)               AS total_value,
        COALESCE(SUM(si.commission_total), 0)    AS total_commission
      FROM sales_items si
      JOIN products p ON si.product_id = p.id
      JOIN sales s    ON s.id = si.sales_id
      ${whereSql}
      GROUP BY p.id, p.name
      ORDER BY total_value DESC
      `,
      params
    );
    res.json({ items: rows });
  } catch (err) {
    console.error("❌ [getSalesSummary error]:", err);
    res.status(500).json({ error: "ไม่สามารถดึงข้อมูลยอดขายได้" });
  }
}

// สรุปค่าคอมตามผู้ขาย + bucket (day|week|month|year)
export async function getSalesCommissions(req, res) {
  try {
    const { from, to, groupBy = "month" } = req.query;

    const bucketExpr =
      groupBy === "day"
        ? "DATE_FORMAT(s.issue_date, '%Y-%m-%d')"
        : groupBy === "week"
        ? "DATE_FORMAT(s.issue_date, '%x-W%v')"
        : groupBy === "year"
        ? "DATE_FORMAT(s.issue_date, '%Y')"
        : "DATE_FORMAT(s.issue_date, '%Y-%m')"; // default month

    const where = [];
    const params = [];
    if (from) { where.push("s.issue_date >= ?"); params.push(from); }
    if (to)   { where.push("s.issue_date <= ?"); params.push(to); }
    const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

    const [rows] = await pool.query(
      `
      SELECT
        s.seller_id,
        u.first_name,
        u.last_name,
        u.email,
        ${bucketExpr} AS bucket,
        COALESCE(SUM(s.seller_commission_total), 0) AS commission_total
      FROM sales s
      LEFT JOIN users u ON u.id = s.seller_id
      ${whereSql}
      GROUP BY s.seller_id, bucket
      ORDER BY s.seller_id, bucket
      `,
      params
    );
    res.json({ items: rows });
  } catch (err) {
    console.error("❌ [getSalesCommissions error]:", err);
    res.status(500).json({ error: "ไม่สามารถดึงข้อมูลค่าคอมได้" });
  }
}
