require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { authenticateToken, optionalAuth } = require('./middleware/auth');

const pagesRouter = require('./routes/pages');
const seedRouter = require('./routes/seed');
const saveRouter = require('./routes/save');
const promptsRouter = require('./routes/prompts');
const authRouter = require('./routes/auth');
const projectsRouter = require('./routes/projects');

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors({
    origin: ['http://localhost:3000', 'http://localhost:3001', 'http://127.0.0.1:3000', 'http://127.0.0.1:3001'],
    credentials: true
}));
app.use(express.json({ limit: '10mb' }));

// Request logging middleware
app.use((req, res, next) => {
    const timestamp = new Date().toISOString();
    console.log(`\n📨 [${timestamp}] ${req.method} ${req.url}`);
    if (req.method !== 'GET' && req.body && Object.keys(req.body).length > 0) {
        // Don't log passwords
        const logBody = { ...req.body };
        if (logBody.password) logBody.password = '***';
        console.log('   Body:', JSON.stringify(logBody).substring(0, 200));
    }
    next();
});

// ==========================================
// Public Routes (no authentication required)
// ==========================================
app.use('/api/auth', authRouter);

// Health check - public
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ==========================================
// Protected Routes (authentication required)
// ==========================================

// Apply authentication middleware to protected routes
app.use('/api/pages', authenticateToken, pagesRouter);
app.use('/api/seed', authenticateToken, seedRouter);
app.use('/api/save', authenticateToken, saveRouter);
app.use('/api/prompts', authenticateToken, promptsRouter);
app.use('/api/projects', authenticateToken, projectsRouter);

// ==========================================
// Error Handling
// ==========================================

// 404 handler
app.use((req, res, next) => {
    res.status(404).json({
        success: false,
        message: `Route ${req.method} ${req.url} not found`
    });
});

// Global error handler
app.use((err, req, res, next) => {
    console.error('Unhandled error:', err);

    // Handle JWT errors
    if (err.name === 'JsonWebTokenError') {
        return res.status(401).json({
            success: false,
            message: 'Invalid token',
            code: 'TOKEN_INVALID'
        });
    }

    if (err.name === 'TokenExpiredError') {
        return res.status(401).json({
            success: false,
            message: 'Token expired',
            code: 'TOKEN_EXPIRED'
        });
    }

    res.status(500).json({
        success: false,
        message: 'Internal server error'
    });
});

// Start server
app.listen(PORT, () => {
    console.log(`🚀 Backend server running on http://localhost:${PORT}`);
    console.log(`📁 Project root: ${process.env.PROJECT_ROOT || 'Not set'}`);
    console.log(`🔐 JWT authentication enabled`);
});
