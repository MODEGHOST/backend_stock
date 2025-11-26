import { z } from "zod";
import HttpError from "../utils/httpError.js";
import {
  listProducts,
  createProduct,
  updateProduct,
  deleteProduct,
  stockIn,
  stockOut,
  doAssembly,
  getProductById,
} from "../services/product.service.js";

export async function listProductsController(req, res) {
  const q = String(req.query.q || "");
  const page = Number(req.query.page || 1);
  const pageSize = Number(req.query.pageSize || 10);
  const warehouseId = req.query.warehouseId
    ? Number(req.query.warehouseId)
    : undefined;
  const companyId = req.user.company_id;
  const { items, total } = await listProducts({
    q,
    page,
    pageSize,
    warehouseId,
    companyId,
  });
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
  console.log("===== CREATE PRODUCT REQUEST =====");
  console.log("BODY:", req.body);
  console.log("USER:", req.user);

  const dto = createSchema.parse(req.body || {});
  dto.company_id = req.user.company_id;
  dto.user_id = req.user.id;  
  dto.user_name = req.user.name || 'Unknown User';
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
  dto.user_name = `${req.user.first_name} ${req.user.last_name}`.trim();
  const companyId = req.user.company_id;
  const p = await updateProduct(id, dto, companyId);
  res.json(p);
}

export async function deleteProductController(req, res) {
  const id = Number(req.params.id);
  const companyId = req.user.company_id;
  await deleteProduct(id, companyId);
  res.json({ ok: true });
}

const inOutSchema = z.object({
  product_id: z.number().or(z.string()).transform(Number),
  qty: z
    .number()
    .or(z.string())
    .transform(Number)
    .refine((n) => n > 0, "qty > 0"),
  note: z.string().optional(),
  warehouseId: z.number().or(z.string()).transform(Number).optional(),
});

export async function stockInController(req, res) {
  const dto = inOutSchema.parse(req.body || {});
  dto.company_id = req.user.company_id;
  dto.user_name = `${req.user.first_name} ${req.user.last_name}`.trim();
  const p = await stockIn(dto);
  res.json(p);
}

export async function stockOutController(req, res) {
  const dto = inOutSchema.parse(req.body || {});
  dto.company_id = req.user.company_id;
  dto.user_name = `${req.user.first_name} ${req.user.last_name}`.trim();
  const p = await stockOut(dto);
  res.json(p);
}

const assemblySchema = z.object({
  components: z
    .array(
      z.object({
        productId: z.number().or(z.string()).transform(Number),
        perUnit: z.number().or(z.string()).transform(Number),
      })
    )
    .min(1),
  result: z.object({
    code: z.string().min(1),
    name: z.string().min(1),
    unit: z.string().min(1),
    price: z.number().or(z.string()).transform(Number).default(0),
    qty: z
      .number()
      .or(z.string())
      .transform(Number)
      .refine((n) => n > 0, "qty > 0"),
  }),
  warehouseId: z.number().or(z.string()).transform(Number).optional(),
});

export async function assemblyController(req, res) {
  try {
    const dto = assemblySchema.parse(req.body || {});
    dto.company_id = req.user.company_id;
    dto.user_name = `${req.user.first_name} ${req.user.last_name}`.trim();
    const result = await doAssembly(dto);
    res.json({ ok: true, result });
  } catch (err) {
    res
      .status(err.status || 400)
      .json({ error: err.message || "Assembly failed" });
  }
}

export async function getProductByIdController(req, res) {
  const id = Number(req.params.id);
  if (isNaN(id)) throw new HttpError(400, "Invalid ID");
  const warehouseId = req.query.warehouseId
    ? Number(req.query.warehouseId)
    : undefined;
  const companyId = req.user.company_id;
  const product = await getProductById(id, warehouseId, companyId);
  if (!product) throw new HttpError(404, "Product not found");
  res.json(product);
}
