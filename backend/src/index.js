require('dotenv').config();
const express = require('express');
const cors = require('cors');

const pagesRouter = require('./routes/pages');
const seedRouter = require('./routes/seed');
const saveRouter = require('./routes/save');
const promptsRouter = require('./routes/prompts');

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors({
    origin: ['http://localhost:3000', 'http://localhost:3001', 'http://127.0.0.1:3000', 'http://127.0.0.1:3001'],
    credentials: true
}));
app.use(express.json({ limit: '10mb' }));

// Routes
app.use('/api/pages', pagesRouter);
app.use('/api/seed', seedRouter);
app.use('/api/save', saveRouter);
app.use('/api/prompts', promptsRouter);

// Health check
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Start server
app.listen(PORT, () => {
    console.log(`🚀 Backend server running on http://localhost:${PORT}`);
    console.log(`📁 Project root: ${process.env.PROJECT_ROOT || 'Not set'}`);
});
