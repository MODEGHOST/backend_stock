import { Router } from "express";
import {
  listProductsController,
  createProductController,
  updateProductController,
  deleteProductController,
  stockInController,
  stockOutController,
  assemblyController,
  getProductByIdController,
} from "../controllers/product.controller.js";
import requireAuth from "../middleware/auth.js";

const r = Router();
r.get("/", requireAuth, listProductsController);
r.post("/", requireAuth, createProductController);
r.put("/:id", requireAuth, updateProductController);
r.delete("/:id", requireAuth, deleteProductController);
r.get("/:id", requireAuth, getProductByIdController);
r.post("/stock/in", requireAuth, stockInController);
r.post("/stock/out", requireAuth, stockOutController);
r.post("/assembly", requireAuth, assemblyController);

export default r;
