// src/services/sale.service.js
import { pool } from "../config/db.js";

export async function createSale(data) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    // 1) ใบขายหลัก
    const [saleResult] = await conn.query(
      `INSERT INTO sales (seller_id, issue_date, valid_until, total, seller_commission_total)
       VALUES (?, ?, ?, ?, ?)`,
      [
        data.sellerId,
        data.issueDate,
        data.validUntilDate,
        Number(data.totalAmount) || 0,
        Number(data.sellerCommissionTotal) || 0,
      ]
    );
    const saleId = saleResult.insertId;

    // 2) รายการสินค้า
    for (const item of data.items) {
      // หา product + stock
      const [productRow] = await conn.query(
        `
        SELECT p.id AS product_id, ps.qty AS qty
        FROM products p
        LEFT JOIN product_stock ps ON ps.product_id = p.id
        WHERE p.name = ?
        LIMIT 1
        `,
        [item.productName]
      );
      const product = productRow?.[0];
      if (!product) throw new Error(`ไม่พบสินค้า ${item.productName}`);
      const curQty = Number(product.qty ?? 0);
      const usedQty = Number(item.quantity ?? 0);
      if (curQty < usedQty) {
        throw new Error(`สต็อกสินค้า ${item.productName} ไม่เพียงพอ (เหลือ ${curQty})`);
      }

      // insert sales_items (มีฟิลด์ค่าคอม)
      await conn.query(
        `
        INSERT INTO sales_items
          (sales_id, product_id, quantity, price,
           discount_percent, discount_amount, tax_type, tax, before_tax, withholding_tax, total,
           commission_mode, commission_preset, commission_custom_percent,
           commission_amount_per_unit, commission_per_unit, commission_total)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
        [
          saleId,
          product.product_id,
          Number(item.quantity) || 0,
          Number(item.price) || 0,
          Number(item.discount) || 0,
          Number(item.discountAmount) || 0,
          item.taxType,
          Number(item.tax) || 0,
          Number(item.beforeTax) || 0,
          Number(item.withholdingTax) || 0,
          Number(item.total) || 0,

          item.commissionMode, // 'percent' | 'amount'
          item.commissionPreset === null ? null : Number(item.commissionPreset),
          item.commissionPreset === null
            ? (item.commissionCustomPercent == null ? null : Number(item.commissionCustomPercent))
            : null,
          Number(item.commissionAmountPerUnit) || 0,
          Number(item.commissionPerUnit) || 0,
          Number(item.commissionTotal) || 0,
        ]
      );

      // ตัดสต็อก
      const newQty = Math.max(0, curQty - usedQty);
      await conn.query(`UPDATE product_stock SET qty = ? WHERE product_id = ?`, [
        newQty,
        product.product_id,
      ]);

      // ประวัติคลัง
      await conn.query(
        `INSERT INTO stock_moves (product_id, qty, move_type, note, created_at)
         VALUES (?, ?, 'OUT', ?, NOW())`,
        [product.product_id, usedQty, `ขายสินค้าเลขที่ ${saleId}`]
      );
    }

    await conn.commit();
    return { id: saleId };
  } catch (err) {
    await conn.rollback();
    console.error("❌ [createSale error]:", err);
    throw err;
  } finally {
    conn.release();
  }
}
