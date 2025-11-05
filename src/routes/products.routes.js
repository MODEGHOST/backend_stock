import { Router } from 'express';
import {
  listProductsController,
  createProductController,
  updateProductController,
  deleteProductController,
  stockInController,
  stockOutController,
  assemblyController,
} from '../controllers/product.controller.js';

const r = Router();

r.get('/', listProductsController);
r.post('/', createProductController);
r.put('/:id', updateProductController);
r.delete('/:id', deleteProductController);

r.post('/stock/in', stockInController);
r.post('/stock/out', stockOutController);

r.post('/assembly', assemblyController);

export default r;
