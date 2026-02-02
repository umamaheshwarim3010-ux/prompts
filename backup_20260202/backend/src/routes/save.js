const express = require('express');
const fs = require('fs');
const path = require('path');
const { prisma } = require('../lib/prisma');

const router = express.Router();

// POST save prompt content
router.post('/', async (req, res) => {
    try {
        const { pageId, content } = req.body;

        if (!pageId || content === undefined) {
            return res.status(400).json({ error: 'Missing pageId or content' });
        }

        const page = await prisma.page.findUnique({
            where: { id: pageId },
            select: { promptFilePath: true }
        });

        if (!page) {
            return res.status(404).json({ error: 'Page not found' });
        }

        if (!page.promptFilePath) {
            return res.status(400).json({ error: 'No prompt file path linked' });
        }

        // Write to file
        fs.writeFileSync(page.promptFilePath, content, 'utf-8');

        // Update rawContent in DB
        await prisma.page.update({
            where: { id: pageId },
            data: { rawContent: content }
        });

        res.json({ success: true });
    } catch (error) {
        console.error('Save error:', error);
        res.status(500).json({ error: 'Failed to save prompt' });
    }
});

module.exports = router;
