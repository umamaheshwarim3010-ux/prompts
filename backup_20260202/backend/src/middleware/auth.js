const jwt = require('jsonwebtoken');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

// JWT Secret - In production, use a secure secret stored in environment variables
const JWT_SECRET = process.env.JWT_SECRET || 'your-super-secret-jwt-key-change-in-production';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '24h';

console.log('🔐 JWT Middleware initialized');
console.log('   JWT_SECRET:', JWT_SECRET ? '✅ Set' : '❌ Using default');
console.log('   JWT_EXPIRES_IN:', JWT_EXPIRES_IN);

/**
 * Generate JWT Token
 * @param {Object} user - User object with id, email, role
 * @returns {string} JWT token
 */
const generateToken = (user) => {
    const payload = {
        id: user.id,
        email: user.email,
        role: user.role
    };

    console.log('🎫 Generating token for user:', user.email);
    return jwt.sign(payload, JWT_SECRET, {
        expiresIn: JWT_EXPIRES_IN
    });
};

/**
 * Generate Refresh Token (longer expiry)
 * @param {Object} user - User object with id
 * @returns {string} Refresh token
 */
const generateRefreshToken = (user) => {
    console.log('🔄 Generating refresh token for user:', user.id);
    return jwt.sign(
        { id: user.id, type: 'refresh' },
        JWT_SECRET,
        { expiresIn: '7d' }
    );
};

/**
 * Verify JWT Token
 * @param {string} token - JWT token to verify
 * @returns {Object|null} Decoded payload or null if invalid
 */
const verifyToken = (token) => {
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        console.log('✅ Token verified for user:', decoded.email || decoded.id);
        return decoded;
    } catch (error) {
        console.log('❌ Token verification failed:', error.message);
        return null;
    }
};

/**
 * Authentication Middleware
 * Verifies JWT token from Authorization header
 */
const authenticateToken = async (req, res, next) => {
    console.log(`\n🔒 Auth Middleware - ${req.method} ${req.originalUrl}`);

    try {
        // Get token from Authorization header
        const authHeader = req.headers['authorization'];
        const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

        if (!token) {
            console.log('❌ No token provided in Authorization header');
            return res.status(401).json({
                success: false,
                message: 'Access token is required',
                code: 'TOKEN_MISSING'
            });
        }

        console.log('📝 Token received, verifying...');

        // Verify token
        const decoded = verifyToken(token);

        if (!decoded) {
            console.log('❌ Token is invalid or expired');
            return res.status(401).json({
                success: false,
                message: 'Invalid or expired token',
                code: 'TOKEN_INVALID'
            });
        }

        // Check if user still exists
        const user = await prisma.user.findUnique({
            where: { id: decoded.id },
            select: {
                id: true,
                email: true,
                name: true,
                role: true
            }
        });

        if (!user) {
            console.log('❌ User not found in database:', decoded.id);
            return res.status(401).json({
                success: false,
                message: 'User no longer exists',
                code: 'USER_NOT_FOUND'
            });
        }

        console.log('✅ User authenticated:', user.email);

        // Attach user to request object
        req.user = user;
        next();

    } catch (error) {
        console.error('❌ Authentication error:', error);
        return res.status(500).json({
            success: false,
            message: 'Authentication failed',
            code: 'AUTH_ERROR'
        });
    }
};

/**
 * Optional Authentication Middleware
 * If token is provided, validates it. If not, continues without user.
 */
const optionalAuth = async (req, res, next) => {
    try {
        const authHeader = req.headers['authorization'];
        const token = authHeader && authHeader.split(' ')[1];

        if (!token) {
            req.user = null;
            return next();
        }

        const decoded = verifyToken(token);

        if (decoded) {
            const user = await prisma.user.findUnique({
                where: { id: decoded.id },
                select: {
                    id: true,
                    email: true,
                    name: true,
                    role: true
                }
            });
            req.user = user;
        } else {
            req.user = null;
        }

        next();
    } catch (error) {
        req.user = null;
        next();
    }
};

/**
 * Role-based Authorization Middleware
 * @param {...string} roles - Allowed roles
 */
const requireRole = (...roles) => {
    return (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({
                success: false,
                message: 'Authentication required',
                code: 'AUTH_REQUIRED'
            });
        }

        if (!roles.includes(req.user.role)) {
            return res.status(403).json({
                success: false,
                message: 'Insufficient permissions',
                code: 'FORBIDDEN'
            });
        }

        next();
    };
};

module.exports = {
    generateToken,
    generateRefreshToken,
    verifyToken,
    authenticateToken,
    optionalAuth,
    requireRole,
    JWT_SECRET
};
