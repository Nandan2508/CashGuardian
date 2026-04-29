/**
 * middleware/auth.js
 * Middleware to authenticate JWT tokens and authorize roles.
 */
const jwt = require('jsonwebtoken');
require('dotenv').config();

/**
 * Authenticates the JWT token from the Authorization header.
 */
function authenticateToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
        return res.status(401).json({ error: 'Access denied. No token provided.' });
    }

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        req.user = decoded;
        next();
    } catch (err) {
        return res.status(403).json({ error: 'Invalid or expired token.' });
    }
}

/**
 * Authorizes access based on user role.
 * @param {string} role - Required role (e.g., 'admin').
 */
function authorizeRole(role) {
    return (req, res, next) => {
        if (!req.user || req.user.role !== role) {
            return res.status(403).json({ error: `Forbidden. Requires ${role} role.` });
        }
        next();
    };
}

module.exports = { authenticateToken, authorizeRole };
