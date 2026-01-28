const express = require('express');
const { prisma } = require('../lib/prisma');

const router = express.Router();

// GET all pages with their data
router.get('/', async (req, res) => {
    try {
        const pages = await prisma.page.findMany({
            include: {
                sections: {
                    include: {
                        prompts: true
                    }
                },
                stateVars: true,
                functions: true
            }
        });

        const masterPrompts = await prisma.masterPrompt.findMany();

        res.json({ pages, masterPrompts });
    } catch (error) {
        console.error('Error fetching pages:', error);
        res.status(500).json({ error: 'Failed to fetch pages' });
    }
});

module.exports = router;
