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

export async function listProducts({ q = '', page = 1, pageSize = 10 }) {
  const offset = (page - 1) * pageSize;
  const like = `%${q.trim()}%`;
  const [rows] = await pool.query(
    `SELECT id, code, name, unit, price, stock_qty
     FROM products
     WHERE code LIKE ? OR name LIKE ? OR unit LIKE ?
     ORDER BY code ASC
     LIMIT ? OFFSET ?`,
    [like, like, like, Number(pageSize), Number(offset)]
  );

  const [[{ total }]] = await pool.query(
    `SELECT COUNT(*) AS total
     FROM products
     WHERE code LIKE ? OR name LIKE ? OR unit LIKE ?`,
    [like, like, like]
  );

  return { items: rows, total };
}

export async function createProduct({ code, name, unit, price = 0, stock = 0 }) {
  const exists = await findProductByCode(code);
  if (exists) throw new HttpError(409, 'รหัสสินค้านี้ถูกใช้แล้ว');

  const [res] = await pool.query(
    `INSERT INTO products (code, name, unit, price, stock_qty)
     VALUES (?, ?, ?, ?, ?)`,
    [code.trim(), name.trim(), unit.trim(), Number(price || 0), Number(stock || 0)]
  );
  return await findProductById(res.insertId);
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

async function addMove(product_id, move_type, qty, note = null) {
  await pool.query(
    `INSERT INTO stock_moves (product_id, move_type, qty, note)
     VALUES (?, ?, ?, ?)`,
    [product_id, move_type, Number(qty), note]
  );
}

export async function stockIn({ product_id, qty, note }) {
  const p = await findProductById(product_id);
  if (!p) throw new HttpError(404, 'ไม่พบสินค้า');
  await pool.query(`UPDATE products SET stock_qty = stock_qty + ? WHERE id = ?`, [qty, product_id]);
  await addMove(product_id, 'IN', qty, note);
  return await findProductById(product_id);
}

export async function stockOut({ product_id, qty, note }) {
  const p = await findProductById(product_id);
  if (!p) throw new HttpError(404, 'ไม่พบสินค้า');
  if (p.stock_qty < qty) throw new HttpError(400, `สต็อกไม่พอ (${p.code})`);
  await pool.query(`UPDATE products SET stock_qty = stock_qty - ? WHERE id = ?`, [qty, product_id]);
  await addMove(product_id, 'OUT', qty, note);
  return await findProductById(product_id);
}

export async function doAssembly({ components = [], result }) {
  if (!components.length) throw new HttpError(400, 'ไม่มีรายการส่วนประกอบ');
  if (!result?.qty || !result?.code) throw new HttpError(400, 'ผลลัพธ์ไม่ครบ');

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    for (const c of components) {
      const [[row]] = await conn.query(
        'SELECT id, code, stock_qty FROM products WHERE id = ? FOR UPDATE',
        [c.productId]
      );
      if (!row) throw new HttpError(404, 'ไม่พบสินค้าในส่วนประกอบ');
      const need = Number(c.perUnit || 0) * Number(result.qty);
      if (row.stock_qty < need) {
        throw new HttpError(400, `สต็อกไม่พอ: ${row.code} ต้องใช้ ${need} แต่มี ${row.stock_qty}`);
      }
    }

    for (const c of components) {
      const need = Number(c.perUnit || 0) * Number(result.qty);
      await conn.query(`UPDATE products SET stock_qty = stock_qty - ? WHERE id = ?`, [need, c.productId]);
      await conn.query(
        `INSERT INTO stock_moves (product_id, move_type, qty, note) VALUES (?, 'ASSEMBLY_OUT', ?, ?)`,
        [c.productId, need, `for ${result.code}`]
      );
    }

    const [existRows] = await conn.query('SELECT * FROM products WHERE code = ? LIMIT 1', [result.code.trim()]);
    let resultId;
    if (existRows.length) {
      const existed = existRows[0];
      await conn.query(
        `UPDATE products SET name = ?, unit = ?, price = ?, stock_qty = stock_qty + ? WHERE id = ?`,
        [result.name.trim(), result.unit.trim(), Number(result.price || 0), Number(result.qty), existed.id]
      );
      resultId = existed.id;
    } else {
      const [ins] = await conn.query(
        `INSERT INTO products (code, name, unit, price, stock_qty)
         VALUES (?, ?, ?, ?, ?)`,
        [result.code.trim(), result.name.trim(), result.unit.trim(), Number(result.price || 0), Number(result.qty)]
      );
      resultId = ins.insertId;
    }

    await conn.query(
      `INSERT INTO stock_moves (product_id, move_type, qty, note) VALUES (?, 'ASSEMBLY_IN', ?, ?)`,
      [resultId, Number(result.qty), 'assembly result']
    );

    await conn.commit();

    const [rows] = await conn.query('SELECT id, code, name, unit, price, stock_qty FROM products WHERE id = ?', [resultId]);
    return rows[0];
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
}

export async function getProductById(id) {
  const [rows] = await pool.query(
    'SELECT id, code, name, unit, price, stock_qty FROM products WHERE id = ? LIMIT 1',
    [id]
  );
  return rows[0] || null;
}
