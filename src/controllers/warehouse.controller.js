import { pool } from '../config/db.js'
import HttpError from '../utils/httpError.js'

export async function listWarehousesController(req, res) {
  const companyId = req.user?.company_id
  if (!companyId) throw new HttpError(403, 'Unauthorized company')

  const [rows] = await pool.query(
    `SELECT * FROM warehouses WHERE company_id = ? ORDER BY id ASC`,
    [companyId]
  )

  res.json({ items: rows })
}

export async function getWarehouseByIdController(req, res) {
  const id = Number(req.params.id)
  const companyId = req.user?.company_id
  if (!companyId) throw new HttpError(403, 'Unauthorized company')

  const [[row]] = await pool.query(
    `SELECT * FROM warehouses WHERE id = ? AND company_id = ?`,
    [id, companyId]
  )

  if (!row) throw new HttpError(404, 'Warehouse not found')
  res.json(row)
}

export async function createWarehouseController(req, res) {
  const { name, location, description } = req.body
  if (!name) throw new HttpError(400, 'name is required')

  const companyId = req.user?.company_id
  if (!companyId) throw new HttpError(403, 'Unauthorized company')

  const [result] = await pool.query(
    `INSERT INTO warehouses (name, location, description, company_id)
     VALUES (?, ?, ?, ?)`,
    [name.trim(), location?.trim() || null, description?.trim() || null, companyId]
  )

  const [[row]] = await pool.query(
    `SELECT * FROM warehouses WHERE id = ? AND company_id = ?`,
    [result.insertId, companyId]
  )

  res.status(201).json(row)
}

export async function updateWarehouseController(req, res) {
  const id = Number(req.params.id)
  const { name, location, description } = req.body
  const companyId = req.user?.company_id
  if (!companyId) throw new HttpError(403, 'Unauthorized company')

  const [r] = await pool.query(
    `SELECT * FROM warehouses WHERE id = ? AND company_id = ?`,
    [id, companyId]
  )
  if (!r.length) throw new HttpError(404, 'Warehouse not found')

  await pool.query(
    `UPDATE warehouses 
     SET name=?, location=?, description=? 
     WHERE id=? AND company_id=?`,
    [name.trim(), location?.trim() || null, description?.trim() || null, id, companyId]
  )

  const [[row]] = await pool.query(
    `SELECT * FROM warehouses WHERE id = ? AND company_id = ?`,
    [id, companyId]
  )

  res.json(row)
}

export async function deleteWarehouseController(req, res) {
  const id = Number(req.params.id)
  const companyId = req.user?.company_id
  if (!companyId) throw new HttpError(403, 'Unauthorized company')

  const [r] = await pool.query(
    `SELECT id FROM warehouses WHERE id = ? AND company_id = ?`,
    [id, companyId]
  )
  if (!r.length) throw new HttpError(404, 'Warehouse not found')

  await pool.query(`DELETE FROM warehouses WHERE id = ? AND company_id = ?`, [id, companyId])

  res.json({ ok: true })
}
