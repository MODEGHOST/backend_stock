import { pool } from '../config/db.js';
import HttpError from '../utils/httpError.js';

export async function listWarehousesController(req, res) {
  const [rows] = await pool.query(`SELECT * FROM warehouses ORDER BY id ASC`);
  res.json({ items: rows });
}

export async function getWarehouseByIdController(req, res) {
  const id = Number(req.params.id);
  const [[row]] = await pool.query(`SELECT * FROM warehouses WHERE id = ?`, [id]);
  if (!row) throw new HttpError(404, 'Warehouse not found');
  res.json(row);
}

export async function createWarehouseController(req, res) {
  const { name, location, description } = req.body;
  if (!name) throw new HttpError(400, 'name is required');

  const [result] = await pool.query(
    `INSERT INTO warehouses (name, location, description)
     VALUES (?, ?, ?)`,
    [name, location ?? null, description ?? null]
  );

  const [[row]] = await pool.query(`SELECT * FROM warehouses WHERE id = ?`, [result.insertId]);
  res.status(201).json(row);
}

export async function updateWarehouseController(req, res) {
  const id = Number(req.params.id);
  const { name, location, description } = req.body;

  const [r] = await pool.query(`SELECT * FROM warehouses WHERE id = ?`, [id]);
  if (!r.length) throw new HttpError(404, 'Warehouse not found');

  await pool.query(
    `UPDATE warehouses SET name=?, location=?, description=? WHERE id=?`,
    [name, location ?? null, description ?? null, id]
  );

  const [[row]] = await pool.query(`SELECT * FROM warehouses WHERE id = ?`, [id]);
  res.json(row);
}

export async function deleteWarehouseController(req, res) {
  const id = Number(req.params.id);
  await pool.query(`DELETE FROM warehouses WHERE id = ?`, [id]);
  res.json({ ok: true });
}
