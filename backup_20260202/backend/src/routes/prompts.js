const express = require('express');
const { prisma } = require('../lib/prisma');

const router = express.Router();

// GET prompts for a specific section
router.get('/', async (req, res) => {
    try {
        const { pageId, section: sectionName } = req.query;

        let whereClause = {};

        if (pageId && sectionName) {
            whereClause = {
                section: {
                    pageId: pageId,
                    name: sectionName
                }
            };
        } else if (sectionName) {
            whereClause = {
                section: {
                    name: sectionName
                }
            };
        }

        const prompts = await prisma.prompt.findMany({
            where: whereClause,
            include: {
                section: {
                    include: {
                        page: {
                            select: {
                                filePath: true,
                                componentName: true
                            }
                        }
                    }
                }
            }
        });

        res.json({ prompts });
    } catch (error) {
        console.error('Error fetching prompts:', error);
        res.status(500).json({ error: 'Failed to fetch prompts' });
    }
});

module.exports = router;
