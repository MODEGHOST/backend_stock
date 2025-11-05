import { Router } from 'express';
import { registerController, loginController, meController } from '../controllers/auth.controller.js';
import requireAuth from '../middleware/auth.js';

const router = Router();

router.post('/register', registerController);
router.post('/login', loginController);
router.get('/me', requireAuth, meController);

export default router;
