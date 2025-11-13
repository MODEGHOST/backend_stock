import { pool } from '../config/db.js';
import HttpError from '../utils/httpError.js';

export async function findProductByCode(code) {
  const [rows] = await pool.query(
    'SELECT * FROM products WHERE code = ? LIMIT 1',
    [String(code).trim()]
  );
  return rows[0] || null;
}

export async function findProductById(id) {
  const [rows] = await pool.query('SELECT * FROM products WHERE id = ? LIMIT 1', [id]);
  return rows[0] || null;
}

/**
 * listProducts - supports optional warehouseId
 * if warehouseId provided -> returns stock_qty for that warehouse (COALESCE to 0)
 * if warehouseId omitted -> returns total stock across warehouses (SUM)
 */
export async function listProducts({ q = '', page = 1, pageSize = 10, warehouseId } = {}) {
  const offset = (page - 1) * pageSize;
  const like = `%${q.trim()}%`;

  if (warehouseId != null) {
    // stock per specified warehouse
    const [rows] = await pool.query(
      `SELECT p.id, p.code, p.name, p.unit, p.price,
              COALESCE(ps.qty, 0) AS stock_qty
       FROM products p
       LEFT JOIN product_stock ps ON ps.product_id = p.id AND ps.warehouse_id = ?
       WHERE p.code LIKE ? OR p.name LIKE ? OR p.unit LIKE ?
       ORDER BY p.code ASC
       LIMIT ? OFFSET ?`,
      [warehouseId, like, like, like, Number(pageSize), Number(offset)]
    );

    const [[{ total }]] = await pool.query(
      `SELECT COUNT(*) AS total
       FROM products p
       WHERE p.code LIKE ? OR p.name LIKE ? OR p.unit LIKE ?`,
      [like, like, like]
    );

    return { items: rows, total };
  } else {
    // aggregate total stock across all warehouses
    const [rows] = await pool.query(
      `SELECT p.id, p.code, p.name, p.unit, p.price,
              COALESCE(SUM(ps.qty), 0) AS stock_qty
       FROM products p
       LEFT JOIN product_stock ps ON ps.product_id = p.id
       WHERE p.code LIKE ? OR p.name LIKE ? OR p.unit LIKE ?
       GROUP BY p.id
       ORDER BY p.code ASC
       LIMIT ? OFFSET ?`,
      [like, like, like, Number(pageSize), Number(offset)]
    );

    const [[{ total }]] = await pool.query(
      `SELECT COUNT(*) AS total
       FROM products p
       WHERE p.code LIKE ? OR p.name LIKE ? OR p.unit LIKE ?`,
      [like, like, like]
    );

    return { items: rows, total };
  }
}

export async function createProduct({ code, name, unit, price = 0, stock = 0, warehouseId } = {}) {
  const exists = await findProductByCode(code);
  if (exists) throw new HttpError(409, 'รหัสสินค้านี้ถูกใช้แล้ว');

  const [res] = await pool.query(
    `INSERT INTO products (code, name, unit, price)
     VALUES (?, ?, ?, ?)`,
    [code.trim(), name.trim(), unit.trim(), Number(price || 0)]
  );
  const product = await findProductById(res.insertId);

  // if initial stock and warehouseId provided -> insert into product_stock
  if (warehouseId != null && Number(stock) > 0) {
    await pool.query(
      `INSERT INTO product_stock (product_id, warehouse_id, qty)
       VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE qty = qty + VALUES(qty)`,
      [product.id, warehouseId, Number(stock)]
    );

    await pool.query(
      `INSERT INTO stock_moves (product_id, warehouse_id, move_type, qty, note)
       VALUES (?, ?, 'IN', ?, 'initial stock')`,
      [product.id, warehouseId, Number(stock)]
    );
  }

  // optionally, you might want to return product including stock_qty = 0 or actual per-warehouse (handled in getProductById)
  return await findProductById(product.id);
}

export async function updateProduct(id, { name, unit, price }) {
  const p = await findProductById(id);
  if (!p) throw new HttpError(404, 'ไม่พบสินค้า');

  await pool.query(
    `UPDATE products
     SET name = ?, unit = ?, price = ?
     WHERE id = ?`,
    [name.trim(), unit.trim(), Number(price || 0), id]
  );
  return await findProductById(id);
}

export async function deleteProduct(id) {
  const p = await findProductById(id);
  if (!p) throw new HttpError(404, 'ไม่พบสินค้า');
  await pool.query('DELETE FROM products WHERE id = ?', [id]);
  return true;
}

// addMove now supports warehouseId
async function addMove(product_id, move_type, qty, note = null, warehouseId = null) {
  await pool.query(
    `INSERT INTO stock_moves (product_id, warehouse_id, move_type, qty, note)
     VALUES (?, ?, ?, ?, ?)`,
    [product_id, warehouseId, move_type, Number(qty), note]
  );
}

export async function stockIn({ product_id, qty, note, warehouseId } = {}) {
  const p = await findProductById(product_id);
  if (!p) throw new HttpError(404, 'ไม่พบสินค้า');

  if (warehouseId == null) throw new HttpError(400, 'warehouseId is required for stock in');

  // insert or add qty for that warehouse
  await pool.query(
    `INSERT INTO product_stock (product_id, warehouse_id, qty)
     VALUES (?, ?, ?)
     ON DUPLICATE KEY UPDATE qty = qty + VALUES(qty)`,
    [product_id, warehouseId, Number(qty)]
  );

  await addMove(product_id, 'IN', qty, note, warehouseId);

  // return the product representation — include total stock (optional)
  return await getProductById(product_id, warehouseId);
}

export async function stockOut({ product_id, qty, note, warehouseId } = {}) {
  const p = await findProductById(product_id);
  if (!p) throw new HttpError(404, 'ไม่พบสินค้า');

  if (warehouseId == null) throw new HttpError(400, 'warehouseId is required for stock out');

  // check available in that warehouse
  const [rows] = await pool.query(
    `SELECT qty FROM product_stock WHERE product_id = ? AND warehouse_id = ? LIMIT 1 FOR UPDATE`,
    [product_id, warehouseId]
  );
  const current = rows[0] ? Number(rows[0].qty) : 0;
  if (current < qty) throw new HttpError(400, `สต็อกไม่พอ (${p.code}) ในคลัง ${warehouseId}`);

  // update qty
  await pool.query(
    `UPDATE product_stock SET qty = qty - ? WHERE product_id = ? AND warehouse_id = ?`,
    [Number(qty), product_id, warehouseId]
  );

  await addMove(product_id, 'OUT', qty, note, warehouseId);

  return await getProductById(product_id, warehouseId);
}

/**
 * doAssembly({
 *   components: [{ productId, perUnit }, ...],
 *   result: { code, name, unit, price, qty },
 *   warehouseId
 * })
 *
 * This function will:
 * - lock component rows in product_stock for the given warehouse (FOR UPDATE)
 * - ensure enough qty, deduct component qty in product_stock
 * - create/update product result in products and add qty into product_stock for same warehouse
 * - insert stock_moves with warehouseId
 */
export async function doAssembly({ components = [], result, warehouseId } = {}) {
  if (!components.length) throw new HttpError(400, 'ไม่มีรายการส่วนประกอบ');
  if (!result?.qty || !result?.code) throw new HttpError(400, 'ผลลัพธ์ไม่ครบ');
  if (warehouseId == null) throw new HttpError(400, 'warehouseId is required for assembly');

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    // 1) check components stock in product_stock for this warehouse
    for (const c of components) {
      const [rows] = await conn.query(
        `SELECT ps.qty, p.code FROM product_stock ps
         JOIN products p ON p.id = ps.product_id
         WHERE ps.product_id = ? AND ps.warehouse_id = ? FOR UPDATE`,
        [c.productId, warehouseId]
      );
      const row = rows[0];
      const need = Number(c.perUnit || 0) * Number(result.qty);
      const available = row ? Number(row.qty) : 0;
      if (!row) throw new HttpError(404, `ไม่พบสินค้า ${c.productId} ในคลัง`);
      if (available < need) throw new HttpError(400, `สต็อกไม่พอ: ${row.code} ต้องใช้ ${need} แต่มี ${available}`);
    }

    // 2) deduct components
    for (const c of components) {
      const need = Number(c.perUnit || 0) * Number(result.qty);
      await conn.query(
        `UPDATE product_stock SET qty = qty - ? WHERE product_id = ? AND warehouse_id = ?`,
        [need, c.productId, warehouseId]
      );
      await conn.query(
        `INSERT INTO stock_moves (product_id, warehouse_id, move_type, qty, note)
         VALUES (?, ?, 'ASSEMBLY_OUT', ?, ?)`,
        [c.productId, warehouseId, need, `for ${result.code}`]
      );
    }

    // 3) create or update result product in products table
    const [existRows] = await conn.query('SELECT * FROM products WHERE code = ? LIMIT 1', [result.code.trim()]);
    let resultId;
    if (existRows.length) {
      const existed = existRows[0];
      await conn.query(
        `UPDATE products SET name = ?, unit = ?, price = ? WHERE id = ?`,
        [result.name.trim(), result.unit.trim(), Number(result.price || 0), existed.id]
      );
      resultId = existed.id;
      // add stock to product_stock
      await conn.query(
        `INSERT INTO product_stock (product_id, warehouse_id, qty)
         VALUES (?, ?, ?)
         ON DUPLICATE KEY UPDATE qty = qty + VALUES(qty)`,
        [resultId, warehouseId, Number(result.qty)]
      );
    } else {
      const [ins] = await conn.query(
        `INSERT INTO products (code, name, unit, price)
         VALUES (?, ?, ?, ?)`,
        [result.code.trim(), result.name.trim(), result.unit.trim(), Number(result.price || 0)]
      );
      resultId = ins.insertId;
      await conn.query(
        `INSERT INTO product_stock (product_id, warehouse_id, qty)
         VALUES (?, ?, ?)`,
        [resultId, warehouseId, Number(result.qty)]
      );
    }

    // 4) insert assembly_in move
    await conn.query(
      `INSERT INTO stock_moves (product_id, warehouse_id, move_type, qty, note)
       VALUES (?, ?, 'ASSEMBLY_IN', ?, ?)`,
      [resultId, warehouseId, Number(result.qty), 'assembly result']
    );

    await conn.commit();

    const [rows] = await conn.query(
      `SELECT p.id, p.code, p.name, p.unit, p.price, COALESCE(ps.qty, 0) AS stock_qty
       FROM products p
       LEFT JOIN product_stock ps ON ps.product_id = p.id AND ps.warehouse_id = ?
       WHERE p.id = ? LIMIT 1`,
      [warehouseId, resultId]
    );
    return rows[0];
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
}

export async function getProductById(id, warehouseId) {
  if (warehouseId != null) {
    const [rows] = await pool.query(
      `SELECT p.id, p.code, p.name, p.unit, p.price, COALESCE(ps.qty,0) AS stock_qty
       FROM products p
       LEFT JOIN product_stock ps ON ps.product_id = p.id AND ps.warehouse_id = ?
       WHERE p.id = ? LIMIT 1`,
      [warehouseId, id]
    );
    return rows[0] || null;
  } else {
    const [rows] = await pool.query(
      `SELECT p.id, p.code, p.name, p.unit, p.price, COALESCE(SUM(ps.qty),0) AS stock_qty
       FROM products p
       LEFT JOIN product_stock ps ON ps.product_id = p.id
       WHERE p.id = ?
       GROUP BY p.id
       LIMIT 1`,
      [id]
    );
    return rows[0] || null;
  }
}
