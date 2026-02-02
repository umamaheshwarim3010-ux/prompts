const express = require('express');
const fs = require('fs');
const path = require('path');
const { prisma } = require('../lib/prisma');

const router = express.Router();

const PROJECT_ROOT = process.env.PROJECT_ROOT || 'C:\\SNIX\\sify\\HrAssist\\exam';
const APP_DIR = path.join(PROJECT_ROOT, 'app');

// Recursively find text files
function getFilesRecursively(dir) {
    let results = [];
    try {
        const list = fs.readdirSync(dir);
        list.forEach(file => {
            const filePath = path.join(dir, file);
            const stat = fs.statSync(filePath);
            if (stat && stat.isDirectory()) {
                if (file !== 'node_modules' && file !== '.next' && file !== 'prompts') {
                    results = results.concat(getFilesRecursively(filePath));
                }
            } else {
                if (file.endsWith('.txt')) {
                    results.push(filePath);
                }
            }
        });
    } catch (e) {
        console.error(`Error scanning directory ${dir}:`, e);
    }
    return results;
}

// Robust text file parser
function parsePromptFile(content) {
    const lines = content.split('\n');
    const sections = [];

    let currentSection = null;
    let currentPrompts = [];

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();

        // Detect Section Header
        const sectionMatch = line.match(/^(?:SECTION|Section)\s*(\d+)[:.]\s*(.*)$/i);

        if (sectionMatch) {
            // Save previous section
            if (currentSection) {
                sections.push({
                    ...currentSection,
                    prompts: currentPrompts
                });
            }

            const rawName = sectionMatch[2].trim();
            let name = rawName;
            let start = i + 1;
            let end = i + 50;

            if (end > lines.length) end = lines.length;

            // Try to extract (Lines X-Y) from the name
            const linesMatch = rawName.match(/(.*?)\s*\(Lines\s*(\d+)-(\d+)\)$/i);

            if (linesMatch) {
                name = linesMatch[1].trim();
                start = parseInt(linesMatch[2]);
                end = parseInt(linesMatch[3]);
            }

            currentSection = {
                name,
                startLine: start,
                endLine: end,
                purpose: 'Section Purpose'
            };
            currentPrompts = [];
        }

        // Look for content
        if (currentSection) {
            if (line.toLowerCase().startsWith('purpose:')) {
                currentSection.purpose = line.substring(8).trim();
            } else if (line.match(/^(PROMPT|TEMPLATE):/i)) {
                const promptLineNum = i + 1;
                const template = line.replace(/^(PROMPT|TEMPLATE):/i, '').trim().replace(/^"|"$/g, '');
                let example = '';
                if (i + 1 < lines.length && lines[i + 1].trim().match(/^EXAMPLE:/i)) {
                    example = lines[i + 1].trim().replace(/^EXAMPLE:/i, '').trim().replace(/^"|"$/g, '');
                }
                currentPrompts.push({ template, example, lineNumber: promptLineNum });
            }
        }
    }

    // Push last section
    if (currentSection) {
        sections.push({
            ...currentSection,
            prompts: currentPrompts
        });
    }

    return sections;
}

// Function to Parse Master NLP Prompt specifically
function parseMasterPrompt(content) {
    const nlpInstructionMatch = content.match(/INSTRUCTION SYNTAX:\s*([\s\S]*?)AVAILABLE SECTIONS:/);
    const nlpInstruction = nlpInstructionMatch ? nlpInstructionMatch[1].trim().replace(/"/g, '') : "Modify [SECTION] to [ACTION] at line [LINE]";

    const summaryMatch = content.match(/AVAILABLE SECTIONS:\s*([\s\S]*?)QUERY EXAMPLES:/);
    const sectionsSummary = summaryMatch ? summaryMatch[1].trim() : "See details";

    const examplesMatch = content.match(/QUERY EXAMPLES:\s*([\s\S]*?)METADATA SOURCE:/);
    const queryExamples = examplesMatch ? examplesMatch[1].trim() : "";

    return { nlpInstruction, sectionsSummary, queryExamples };
}

function extractTargetFile(content, fullPath) {
    const match = content.match(/FILE:\s*([^\s|]+)/i);
    if (match) {
        return match[1].trim().replace(/\\/g, '/');
    }

    let relative = path.relative(PROJECT_ROOT, fullPath);
    relative = relative.replace(/\.txt$/, '.js');
    return relative.replace(/\\/g, '/');
}

// Helper to count lines in a file
function countLines(filePath) {
    try {
        if (!fs.existsSync(filePath)) return 0;
        const content = fs.readFileSync(filePath, 'utf-8');
        return content.split(/\r\n|\r|\n/).length;
    } catch (e) {
        console.warn(`Could not count lines for ${filePath}`);
        return 0;
    }
}

// POST seed database
router.post('/', async (req, res) => {
    try {
        if (!fs.existsSync(APP_DIR)) {
            return res.status(404).json({ error: `Directory not found: ${APP_DIR}` });
        }

        const files = getFilesRecursively(APP_DIR);
        const processed = [];

        for (const filePath of files) {
            const content = fs.readFileSync(filePath, 'utf-8');
            const fileName = path.basename(filePath);

            const targetFilePathRelative = extractTargetFile(content, filePath);
            const targetFilePathAbsolute = path.join(PROJECT_ROOT, targetFilePathRelative.split('/').join(path.sep));

            // Handle MASTER_PROMPT or generic master prompts
            if (fileName.includes('MASTER') || content.includes('MASTER NLP PROMPT')) {
                const parsedMaster = parseMasterPrompt(content);
                await prisma.masterPrompt.upsert({
                    where: { pageFilePath: targetFilePathRelative },
                    update: parsedMaster,
                    create: {
                        pageFilePath: targetFilePathRelative,
                        ...parsedMaster
                    }
                });
                processed.push({ file: fileName, type: 'master', target: targetFilePathRelative });
                continue;
            }

            // Handle regular prompt files
            const sections = parsePromptFile(content);

            if (sections.length === 0) {
                console.log(`Skipping ${fileName}: No sections found`);
                continue;
            }

            const actualTotalLines = countLines(targetFilePathAbsolute);

            // Delete existing page entry to full refresh
            await prisma.page.deleteMany({ where: { filePath: targetFilePathRelative } });

            const jsFileName = path.basename(targetFilePathRelative);
            const componentName = jsFileName.replace(/\.(js|jsx|ts|tsx)$/, '');

            await prisma.page.create({
                data: {
                    filePath: targetFilePathRelative,
                    componentName: componentName,
                    totalLines: actualTotalLines || 0,
                    purpose: `Prompt file for ${jsFileName}`,
                    promptFilePath: filePath,
                    rawContent: content,
                    sections: {
                        create: sections.map(s => ({
                            name: s.name,
                            startLine: s.startLine,
                            endLine: s.endLine,
                            purpose: s.purpose,
                            prompts: {
                                create: s.prompts.map(p => ({
                                    template: p.template,
                                    example: p.example,
                                    lineNumber: p.lineNumber
                                }))
                            }
                        }))
                    }
                }
            });
            processed.push({
                file: fileName,
                type: 'page',
                target: targetFilePathRelative,
                lines: actualTotalLines,
                sections: sections.length
            });
        }

        res.json({ success: true, processed });
    } catch (error) {
        console.error('Seed error:', error);
        res.status(500).json({ error: 'Failed to seed database' });
    }
});

module.exports = router;
