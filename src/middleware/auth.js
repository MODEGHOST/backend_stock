// src/middleware/auth.js
import jwt from 'jsonwebtoken'
import HttpError from '../utils/httpError.js'

export default function requireAuth(req, _res, next) {
  try {
    const header = req.headers.authorization || ''
    const token = header.startsWith('Bearer ') ? header.slice(7) : null
    if (!token) throw new HttpError(401, 'Missing token')

    const decoded = jwt.verify(token, process.env.JWT_ACCESS_SECRET)
    req.user = {
      id: decoded.id,
      email: decoded.email,
      role: decoded.role,
      name: decoded.name,
      company_id: decoded.company_id ?? null
    }
    next()
  } catch (err) {
    if (err && err.name === 'TokenExpiredError') {
      next(new HttpError(401, 'Token expired'))
    } else if (err && err.name === 'JsonWebTokenError') {
      next(new HttpError(401, 'Invalid token'))
    } else {
      next(new HttpError(401, 'Unauthorized'))
    }
  }
}
