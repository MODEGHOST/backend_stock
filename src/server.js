import app from './app.js';
import { pool } from './config/db.js';

const PORT = process.env.PORT || 4000;

app.listen(PORT, () => {
  console.log(`[backend_stock] running http://localhost:${PORT}`);
});
