import { z } from 'zod';
import HttpError from '../utils/httpError.js';
import {
  listProducts,
  createProduct,
  updateProduct,
  deleteProduct,
  stockIn,
  stockOut,
  doAssembly,
  getProductById,
} from '../services/product.service.js';

export async function listProductsController(req, res) {
  const q = String(req.query.q || '');
  const page = Number(req.query.page || 1);
  const pageSize = Number(req.query.pageSize || 10);
  // warehouseId as optional query param
  const warehouseId = req.query.warehouseId ? Number(req.query.warehouseId) : undefined;

  const { items, total } = await listProducts({ q, page, pageSize, warehouseId });
  res.json({ items, total, page, pageSize });
}

const createSchema = z.object({
  code: z.string().min(1),
  name: z.string().min(1),
  unit: z.string().min(1),
  price: z.number().or(z.string()).transform(Number).default(0),
  stock: z.number().or(z.string()).transform(Number).default(0),
  warehouseId: z.number().or(z.string()).transform(Number).optional(),
});

export async function createProductController(req, res) {
  const dto = createSchema.parse(req.body || {});
  const p = await createProduct(dto);
  res.status(201).json(p);
}

const updateSchema = z.object({
  name: z.string().min(1),
  unit: z.string().min(1),
  price: z.number().or(z.string()).transform(Number).default(0),
});

export async function updateProductController(req, res) {
  const id = Number(req.params.id);
  const dto = updateSchema.parse(req.body || {});
  const p = await updateProduct(id, dto);
  res.json(p);
}

export async function deleteProductController(req, res) {
  const id = Number(req.params.id);
  await deleteProduct(id);
  res.json({ ok: true });
}

const inOutSchema = z.object({
  product_id: z.number().or(z.string()).transform(Number),
  qty: z.number().or(z.string()).transform(Number).refine(n => n > 0, 'qty > 0'),
  note: z.string().optional(),
  warehouseId: z.number().or(z.string()).transform(Number).optional(),
});

export async function stockInController(req, res) {
  const dto = inOutSchema.parse(req.body || {});
  const p = await stockIn(dto);
  res.json(p);
}

export async function stockOutController(req, res) {
  const dto = inOutSchema.parse(req.body || {});
  const p = await stockOut(dto);
  res.json(p);
}

const assemblySchema = z.object({
  components: z.array(z.object({
    productId: z.number().or(z.string()).transform(Number),
    perUnit: z.number().or(z.string()).transform(Number),
  })).min(1),
  result: z.object({
    code: z.string().min(1),
    name: z.string().min(1),
    unit: z.string().min(1),
    price: z.number().or(z.string()).transform(Number).default(0),
    qty: z.number().or(z.string()).transform(Number).refine(n => n > 0, 'qty > 0'),
  }),
  warehouseId: z.number().or(z.string()).transform(Number).optional(),
});

export async function assemblyController(req, res) {
  try {
    const dto = assemblySchema.parse(req.body || {});
    const result = await doAssembly(dto);
    res.json({ ok: true, result });
  } catch (err) {
    res.status(err.status || 400).json({ error: err.message || 'Assembly failed' });
  }
}


export async function getProductByIdController(req, res) {
  const id = Number(req.params.id);
  if (isNaN(id)) throw new HttpError(400, 'Invalid ID');

  const warehouseId = req.query.warehouseId ? Number(req.query.warehouseId) : undefined;

  const product = await getProductById(id, warehouseId);
  if (!product) throw new HttpError(404, 'Product not found');

  res.json(product);
}
