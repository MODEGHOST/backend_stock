import jwt from 'jsonwebtoken';
import HttpError from '../utils/httpError.js';

export default function requireAuth(req, _res, next) {
  try {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;
    if (!token) throw new HttpError(401, "Missing token");

    req.user = jwt.verify(token, process.env.JWT_ACCESS_SECRET);
    next();
  } catch {
    next(new HttpError(401, "Unauthorized"));
  }
}
