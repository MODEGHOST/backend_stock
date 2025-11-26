import { Router } from 'express'
import {
  listWarehousesController,
  getWarehouseByIdController,
  createWarehouseController,
  updateWarehouseController,
  deleteWarehouseController,
} from '../controllers/warehouse.controller.js'
import requireAuth from '../middleware/auth.js'

const r = Router()
r.use(requireAuth)

r.get('/', listWarehousesController)
r.get('/:id', getWarehouseByIdController)
r.post('/', createWarehouseController)
r.put('/:id', updateWarehouseController)
r.delete('/:id', deleteWarehouseController)

export default r
