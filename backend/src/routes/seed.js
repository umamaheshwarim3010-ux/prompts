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

// Robust text file parser - separates NLP and Developer prompts
// Extracts meaningful content from section text as prompts
function parsePromptFile(content) {
    const lines = content.split('\n');
    const sections = [];

    let currentSection = null;
    let currentPrompts = [];
    let inCodeBlock = false;

    // Helper to determine if a line is meaningful content
    const isSkipLine = (line) => {
        // Skip empty lines
        if (!line || line.length === 0) return true;
        // Skip decoration lines (===, ---, etc.)
        if (/^[=\-\*_]{3,}$/.test(line)) return true;
        // Skip comment lines starting with # (but not ## headers)
        if (/^#[^#]/.test(line) || line === '#') return true;
        return false;
    };

    // Helper to detect if line is a meaningful content line (numbered, bullet, or key topic)
    const isContentLine = (line) => {
        // Numbered items: 1. 2. 3. etc
        if (/^\d+\.\s+.+/.test(line)) return true;
        // Bullet points: ► > - • * ✓ ⚠
        if (/^[►>\-•\*✓⚠]\s+.+/.test(line)) return true;
        // Key topic lines with colon (but not just "PURPOSE:" or "SECTION:")
        if (/^[A-Z][A-Z\s]+:/.test(line) && !/^(PURPOSE|SECTION|IMPORTS|FILE):/i.test(line)) return true;
        // Lines starting with pipe (tables)
        if (/^\|.+\|$/.test(line)) return true;
        return false;
    };

    // Helper to determine if this is likely a heading/intro line (all caps with colon)
    const isHeadingLine = (line) => {
        return /^[A-Z][A-Z\s]+:$/.test(line) || /^[A-Z][A-Z\s]+:\s*$/.test(line);
    };

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        const rawLine = lines[i]; // Keep original for indented content

        // Track code blocks
        if (line.startsWith('```')) {
            inCodeBlock = !inCodeBlock;
            continue;
        }

        // Skip lines inside code blocks (but we'll collect them separately if needed)
        if (inCodeBlock) continue;

        // Detect Section Header
        const sectionMatch = line.match(/^(?:SECTION|Section)\s*(\d+)[:.]?\s*(.*)$/i);

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

            // Find where the next section starts to determine end line
            let end = lines.length;
            for (let j = i + 1; j < lines.length; j++) {
                if (/^(?:SECTION|Section)\s*\d+[:.]?\s*/i.test(lines[j].trim())) {
                    end = j;
                    break;
                }
            }

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
            continue;
        }

        // Look for content within a section
        if (currentSection) {
            // Capture PURPOSE
            if (line.toLowerCase().startsWith('purpose:')) {
                currentSection.purpose = line.substring(8).trim();
                continue;
            }

            // NLP Prompts - Explicit tag
            if (line.match(/^NLP_PROMPT:/i)) {
                const promptLineNum = i + 1;
                const template = line.replace(/^NLP_PROMPT:/i, '').trim().replace(/^"|"$/g, '');
                let example = '';
                if (i + 1 < lines.length && lines[i + 1].trim().match(/^EXAMPLE:/i)) {
                    example = lines[i + 1].trim().replace(/^EXAMPLE:/i, '').trim().replace(/^"|"$/g, '');
                }
                currentPrompts.push({
                    template,
                    example,
                    lineNumber: promptLineNum,
                    promptType: 'NLP'
                });
                continue;
            }

            // Developer Prompts - Explicit tag
            if (line.match(/^DEV_PROMPT:/i)) {
                const promptLineNum = i + 1;
                const template = line.replace(/^DEV_PROMPT:/i, '').trim().replace(/^"|"$/g, '');
                let example = '';
                if (i + 1 < lines.length && lines[i + 1].trim().match(/^EXAMPLE:/i)) {
                    example = lines[i + 1].trim().replace(/^EXAMPLE:/i, '').trim().replace(/^"|"$/g, '');
                }
                currentPrompts.push({
                    template,
                    example,
                    lineNumber: promptLineNum,
                    promptType: 'DEVELOPER'
                });
                continue;
            }

            // Legacy PROMPT/TEMPLATE - Explicit tag
            if (line.match(/^(PROMPT|TEMPLATE):/i)) {
                const promptLineNum = i + 1;
                const template = line.replace(/^(PROMPT|TEMPLATE):/i, '').trim().replace(/^"|"$/g, '');
                let example = '';
                if (i + 1 < lines.length && lines[i + 1].trim().match(/^EXAMPLE:/i)) {
                    example = lines[i + 1].trim().replace(/^EXAMPLE:/i, '').trim().replace(/^"|"$/g, '');
                }
                currentPrompts.push({
                    template,
                    example,
                    lineNumber: promptLineNum,
                    promptType: 'NLP'
                });
                continue;
            }

            // Skip empty/decoration lines
            if (isSkipLine(line)) continue;

            // Extract meaningful content lines as prompts
            // Numbered items (1. HEADER SECTION, 2. CHECK ICON, etc.)
            const numberedMatch = line.match(/^(\d+)\.\s+(.+)$/);
            if (numberedMatch) {
                const promptLineNum = i + 1;
                let template = numberedMatch[2].trim();

                // Collect any sub-content (indented lines following this)
                let details = [];
                let j = i + 1;
                while (j < lines.length) {
                    const nextLine = lines[j].trim();
                    // Stop if we hit another numbered item or section
                    if (/^\d+\.\s+/.test(nextLine) || /^(?:SECTION|Section)\s*\d+/i.test(nextLine)) break;
                    // Stop if we hit a heading line
                    if (isHeadingLine(nextLine)) break;
                    // Collect indented sub-items
                    if (nextLine.startsWith('-') || nextLine.startsWith('•')) {
                        details.push(nextLine.replace(/^[\-•]\s*/, ''));
                    }
                    j++;
                }

                if (details.length > 0) {
                    template = `${template}: ${details.join('; ')}`;
                }

                currentPrompts.push({
                    template,
                    example: '',
                    lineNumber: promptLineNum,
                    promptType: 'NLP'
                });
                continue;
            }

            // Action items (► CHANGE THE LOGO:, etc.)
            const actionMatch = line.match(/^[►>]\s+(.+)$/);
            if (actionMatch) {
                const promptLineNum = i + 1;
                let template = actionMatch[1].trim();

                // Collect any sub-content (indented lines following this)
                let details = [];
                let j = i + 1;
                while (j < lines.length && j < i + 5) { // Look ahead up to 5 lines
                    const nextLine = lines[j].trim();
                    // Stop if we hit another action item or section
                    if (/^[►>]\s+/.test(nextLine) || /^(?:SECTION|Section)\s*\d+/i.test(nextLine)) break;
                    if (/^\d+\.\s+/.test(nextLine)) break;
                    // Collect details
                    if (nextLine.startsWith('-') && !nextLine.startsWith('---')) {
                        details.push(nextLine.replace(/^-\s*/, ''));
                    }
                    j++;
                }

                if (details.length > 0) {
                    template = `${template} ${details.join(' | ')}`;
                }

                currentPrompts.push({
                    template,
                    example: '',
                    lineNumber: promptLineNum,
                    promptType: 'NLP'
                });
                continue;
            }

            // Table rows (| Component | Export | ...)
            if (line.startsWith('|') && line.endsWith('|') && !line.match(/^\|[\-\s\|]+\|$/)) {
                // Skip header separator rows
                const cells = line.split('|').filter(c => c.trim());
                if (cells.length >= 2 && cells[0].trim() && !/^[\-\s]+$/.test(cells[0])) {
                    currentPrompts.push({
                        template: cells.map(c => c.trim()).join(' | '),
                        example: '',
                        lineNumber: i + 1,
                        promptType: 'DEVELOPER'
                    });
                }
                continue;
            }

            // Key topic headings that have content (### HeaderSection, etc.)
            const topicMatch = line.match(/^###?\s+(.+)$/);
            if (topicMatch) {
                const promptLineNum = i + 1;
                let template = topicMatch[1].trim();

                // Collect any following content until next topic
                let details = [];
                let j = i + 1;
                while (j < lines.length && j < i + 10) {
                    const nextLine = lines[j].trim();
                    if (/^###?\s+/.test(nextLine)) break;
                    if (/^(?:SECTION|Section)\s*\d+/i.test(nextLine)) break;
                    if (nextLine && !isSkipLine(nextLine) && !nextLine.startsWith('```')) {
                        // Take first meaningful line as example
                        if (details.length < 3) {
                            details.push(nextLine);
                        }
                    }
                    j++;
                }

                currentPrompts.push({
                    template,
                    example: details.length > 0 ? details[0] : '',
                    lineNumber: promptLineNum,
                    promptType: 'DEVELOPER'
                });
                continue;
            }

            // All-caps heading with content following (VISUAL LAYOUT:, COLOR PALETTE:, etc.)
            const capsHeadingMatch = line.match(/^([A-Z][A-Z\s]+):$/);
            if (capsHeadingMatch && !/^(PURPOSE|SECTION|IMPORTS|FILE|END):/i.test(line)) {
                const promptLineNum = i + 1;
                let template = capsHeadingMatch[1].trim();

                currentPrompts.push({
                    template,
                    example: '',
                    lineNumber: promptLineNum,
                    promptType: 'NLP'
                });
                continue;
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
                                    lineNumber: p.lineNumber,
                                    promptType: p.promptType || 'NLP'
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
