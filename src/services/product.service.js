import { pool } from "../config/db.js";
import HttpError from "../utils/httpError.js";

async function ensureWarehouseBelongsToCompany(warehouseId, companyId) {
  const [[row]] = await pool.query(
    `SELECT id FROM warehouses WHERE id = ? AND company_id = ? LIMIT 1`,
    [warehouseId, companyId]
  );
  if (!row) throw new HttpError(403, "โกดังนี้ไม่อยู่ในบริษัทของคุณ");
}

export async function findProductByCode(code, companyId) {
  const [rows] = await pool.query(
    "SELECT * FROM products WHERE code = ? AND company_id = ? LIMIT 1",
    [String(code).trim(), companyId]
  );
  return rows[0] || null;
}

export async function findProductById(id, companyId) {
  const [rows] = await pool.query(
    "SELECT * FROM products WHERE id = ? AND company_id = ? LIMIT 1",
    [id, companyId]
  );
  return rows[0] || null;
}

export async function listProducts({
  q = "",
  page = 1,
  pageSize = 10,
  warehouseId,
  companyId,
} = {}) {
  const offset = (page - 1) * pageSize;
  const like = `%${q.trim()}%`;

  if (warehouseId != null) {
    // ดูเฉพาะโกดังนี้เท่านั้น
    const [rows] = await pool.query(
      `SELECT p.id, p.code, p.name, p.unit, p.price,
              ps.qty AS stock_qty
       FROM products p
       INNER JOIN product_stock ps
         ON ps.product_id = p.id
        AND ps.warehouse_id = ?
        AND ps.company_id = ?
       WHERE p.company_id = ?
         AND (p.code LIKE ? OR p.name LIKE ? OR p.unit LIKE ?)
       ORDER BY p.code ASC
       LIMIT ? OFFSET ?`,
      [
        warehouseId,
        companyId,
        companyId,
        like,
        like,
        like,
        Number(pageSize),
        Number(offset),
      ]
    );

    const [[{ total }]] = await pool.query(
      `SELECT COUNT(DISTINCT p.id) AS total
       FROM products p
       INNER JOIN product_stock ps
         ON ps.product_id = p.id
        AND ps.warehouse_id = ?
        AND ps.company_id = ?
       WHERE p.company_id = ?
         AND (p.code LIKE ? OR p.name LIKE ? OR p.unit LIKE ?)`,
      [warehouseId, companyId, companyId, like, like, like]
    );

    return { items: rows, total };
  } else {
    // All warehouses เหมือนเดิมได้เลย
    const [rows] = await pool.query(
      `SELECT p.id, p.code, p.name, p.unit, p.price,
              COALESCE(SUM(ps.qty), 0) AS stock_qty
       FROM products p
       LEFT JOIN product_stock ps ON ps.product_id = p.id AND ps.company_id = ?
       WHERE p.company_id = ? AND (p.code LIKE ? OR p.name LIKE ? OR p.unit LIKE ?)
       GROUP BY p.id
       ORDER BY p.code ASC
       LIMIT ? OFFSET ?`,
      [companyId, companyId, like, like, like, Number(pageSize), Number(offset)]
    );

    const [[{ total }]] = await pool.query(
      `SELECT COUNT(*) AS total
       FROM products p
       WHERE p.company_id = ? AND (p.code LIKE ? OR p.name LIKE ? OR p.unit LIKE ?)`,

      [companyId, like, like, like]
    );

    return { items: rows, total };
  }
}

export async function createProduct({ code, name, unit, price = 0, stock = 0, warehouseId, company_id, user_name }) {
  const exists = await findProductByCode(code, company_id);
  if (exists) throw new HttpError(409, 'รหัสสินค้านี้ถูกใช้แล้ว');

  const [res] = await pool.query(
    `INSERT INTO products (code, name, unit, price, company_id, created_by)
     VALUES (?, ?, ?, ?, ?, ?)`,  // เพิ่ม created_by
    [code.trim(), name.trim(), unit.trim(), Number(price || 0), company_id, user_name] // ใช้ user_name แทน user_id
  );

  const product = await findProductById(res.insertId, company_id);

  if (warehouseId && Number(stock) > 0) {
    await ensureWarehouseBelongsToCompany(warehouseId, company_id);
    await pool.query(
      `INSERT INTO product_stock (product_id, warehouse_id, qty, company_id)
       VALUES (?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE qty = qty + VALUES(qty)`,
      [product.id, warehouseId, Number(stock), company_id]
    );

    await pool.query(
      `INSERT INTO stock_moves (product_id, warehouse_id, move_type, qty, note, company_id)
       VALUES (?, ?, 'IN', ?, 'initial stock', ?)`,
      [product.id, warehouseId, Number(stock), company_id]
    );
  }

  return product;
}


export async function updateProduct(id, { name, unit, price }, companyId) {
  const p = await findProductById(id, companyId);
  if (!p) throw new HttpError(404, "ไม่พบสินค้า");

  await pool.query(
    `UPDATE products SET name = ?, unit = ?, price = ? WHERE id = ? AND company_id = ?`,
    [name.trim(), unit.trim(), Number(price || 0), id, companyId]
  );
  return await findProductById(id, companyId);
}

export async function deleteProduct(id, companyId) {
  const p = await findProductById(id, companyId);
  if (!p) throw new HttpError(404, "ไม่พบสินค้า");
  await pool.query("DELETE FROM products WHERE id = ? AND company_id = ?", [
    id,
    companyId,
  ]);
  return true;
}

async function addMove(
  product_id,
  move_type,
  qty,
  note = null,
  warehouseId = null,
  companyId
) {
  await pool.query(
    `INSERT INTO stock_moves (product_id, warehouse_id, move_type, qty, note, company_id)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [product_id, warehouseId, move_type, Number(qty), note, companyId]
  );
}

export async function stockIn({
  product_id,
  qty,
  note,
  warehouseId,
  company_id,
}) {
  const p = await findProductById(product_id, company_id);
  if (!p) throw new HttpError(404, "ไม่พบสินค้า");
  if (!warehouseId) throw new HttpError(400, "warehouseId is required");
  await ensureWarehouseBelongsToCompany(warehouseId, company_id);

  await pool.query(
    `INSERT INTO product_stock (product_id, warehouse_id, qty, company_id)
     VALUES (?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE qty = qty + VALUES(qty)`,
    [product_id, warehouseId, Number(qty), company_id]
  );

  await addMove(product_id, "IN", qty, note, warehouseId, company_id);
  return await getProductById(product_id, warehouseId, company_id);
}

export async function stockOut({
  product_id,
  qty,
  note,
  warehouseId,
  company_id,
}) {
  const p = await findProductById(product_id, company_id);
  if (!p) throw new HttpError(404, "ไม่พบสินค้า");
  if (!warehouseId) throw new HttpError(400, "warehouseId is required");
  await ensureWarehouseBelongsToCompany(warehouseId, company_id);

  const [rows] = await pool.query(
    `SELECT qty FROM product_stock WHERE product_id = ? AND warehouse_id = ? AND company_id = ? LIMIT 1 FOR UPDATE`,
    [product_id, warehouseId, company_id]
  );
  const current = rows[0] ? Number(rows[0].qty) : 0;
  if (current < qty)
    throw new HttpError(400, `สต็อกไม่พอ (${p.code}) ในคลัง ${warehouseId}`);

  await pool.query(
    `UPDATE product_stock SET qty = qty - ? WHERE product_id = ? AND warehouse_id = ? AND company_id = ?`,
    [Number(qty), product_id, warehouseId, company_id]
  );

  await addMove(product_id, "OUT", qty, note, warehouseId, company_id);
  return await getProductById(product_id, warehouseId, company_id);
}

export async function doAssembly({
  components = [],
  result,
  warehouseId,
  company_id,
} = {}) {
  if (!components.length) throw new HttpError(400, "ไม่มีรายการส่วนประกอบ");
  if (!result?.qty || !result?.code) throw new HttpError(400, "ผลลัพธ์ไม่ครบ");
  if (warehouseId == null) throw new HttpError(400, "warehouseId is required");
  await ensureWarehouseBelongsToCompany(warehouseId, company_id);

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    for (const c of components) {
      const [rows] = await conn.query(
        `SELECT ps.qty, p.code FROM product_stock ps
         JOIN products p ON p.id = ps.product_id
         WHERE ps.product_id = ? AND ps.warehouse_id = ? AND ps.company_id = ? FOR UPDATE`,
        [c.productId, warehouseId, company_id]
      );
      const row = rows[0];
      const need = Number(c.perUnit || 0) * Number(result.qty);
      const available = row ? Number(row.qty) : 0;
      if (!row) throw new HttpError(404, `ไม่พบสินค้า ${c.productId} ในคลัง`);
      if (available < need)
        throw new HttpError(
          400,
          `สต็อกไม่พอ: ${row.code} ต้องใช้ ${need} แต่มี ${available}`
        );
    }

    for (const c of components) {
      const need = Number(c.perUnit || 0) * Number(result.qty);
      await conn.query(
        `UPDATE product_stock SET qty = qty - ? WHERE product_id = ? AND warehouse_id = ? AND company_id = ?`,
        [need, c.productId, warehouseId, company_id]
      );
      await conn.query(
        `INSERT INTO stock_moves (product_id, warehouse_id, move_type, qty, note, company_id)
         VALUES (?, ?, 'ASSEMBLY_OUT', ?, ?, ?)`,
        [c.productId, warehouseId, need, `for ${result.code}`, company_id]
      );
    }

    const [existRows] = await conn.query(
      `SELECT * FROM products WHERE code = ? AND company_id = ? LIMIT 1`,
      [result.code.trim(), company_id]
    );
    let resultId;
    if (existRows.length) {
      const existed = existRows[0];
      await conn.query(
        `UPDATE products SET name = ?, unit = ?, price = ? WHERE id = ? AND company_id = ?`,
        [
          result.name.trim(),
          result.unit.trim(),
          Number(result.price || 0),
          existed.id,
          company_id,
        ]
      );
      resultId = existed.id;
    } else {
      const [ins] = await conn.query(
        `INSERT INTO products (code, name, unit, price, company_id)
         VALUES (?, ?, ?, ?, ?)`,
        [
          result.code.trim(),
          result.name.trim(),
          result.unit.trim(),
          Number(result.price || 0),
          company_id,
        ]
      );
      resultId = ins.insertId;
    }

    await conn.query(
      `INSERT INTO product_stock (product_id, warehouse_id, qty, company_id)
       VALUES (?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE qty = qty + VALUES(qty)`,
      [resultId, warehouseId, Number(result.qty), company_id]
    );

    await conn.query(
      `INSERT INTO stock_moves (product_id, warehouse_id, move_type, qty, note, company_id)
       VALUES (?, ?, 'ASSEMBLY_IN', ?, ?, ?)`,
      [resultId, warehouseId, Number(result.qty), "assembly result", company_id]
    );

    await conn.commit();

    const [rows] = await conn.query(
      `SELECT p.id, p.code, p.name, p.unit, p.price, COALESCE(ps.qty, 0) AS stock_qty
       FROM products p
       LEFT JOIN product_stock ps ON ps.product_id = p.id AND ps.warehouse_id = ?
       WHERE p.id = ? AND p.company_id = ? LIMIT 1`,
      [warehouseId, resultId, company_id]
    );
    return rows[0];
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
}

export async function getProductById(id, warehouseId, companyId) {
  if (warehouseId != null) {
    const [rows] = await pool.query(
      `SELECT p.id, p.code, p.name, p.unit, p.price, COALESCE(ps.qty,0) AS stock_qty
       FROM products p
       LEFT JOIN product_stock ps ON ps.product_id = p.id AND ps.warehouse_id = ?
       WHERE p.id = ? AND p.company_id = ?
       LIMIT 1`,
      [warehouseId, id, companyId]
    );
    return rows[0] || null;
  } else {
    const [rows] = await pool.query(
      `SELECT p.id, p.code, p.name, p.unit, p.price, COALESCE(SUM(ps.qty),0) AS stock_qty
       FROM products p
       LEFT JOIN product_stock ps ON ps.product_id = p.id
       WHERE p.id = ? AND p.company_id = ?
       GROUP BY p.id
       LIMIT 1`,
      [id, companyId]
    );
    return rows[0] || null;
  }
}
