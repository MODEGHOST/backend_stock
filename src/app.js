import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import morgan from 'morgan';

import authRoutes from './routes/auth.routes.js';
import productRoutes from './routes/products.routes.js';

const app = express();

app.use(cors({
  origin: process.env.CORS_ORIGIN?.split(',').map(s => s.trim()) || '*',
}));
app.use(express.json());
app.use(morgan('dev'));

app.get('/health', (_req, res) => res.json({ ok: true }));

app.use('/api/auth', authRoutes);
app.use('/api/products', productRoutes);

app.use((req, res) => res.status(404).json({ error: 'Not found' }));
export default app;
