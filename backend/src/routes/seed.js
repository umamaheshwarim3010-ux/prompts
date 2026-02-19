const express = require('express');
const fs = require('fs');
const path = require('path');
const { prisma } = require('../lib/prisma');

const router = express.Router();

// Helper to find project root
const findProjectRoot = () => {
    let candidates = [];
    if (process.env.PROJECT_ROOT) {
        candidates.push(process.env.PROJECT_ROOT);
    }

    candidates.push('C:\\SNIX\\sify\\HrAssist\\exam');

    const relativeRoot = path.resolve(__dirname, '../../../../../');
    candidates.push(relativeRoot);

    for (const root of candidates) {
        const checkAppDir = path.join(root, 'app');
        if (fs.existsSync(checkAppDir)) {
            console.log(`Found valid project root at: ${root}`);
            return root;
        }
    }

    return process.env.PROJECT_ROOT || 'C:\\SNIX\\sify\\HrAssist\\exam';
};

const PROJECT_ROOT = findProjectRoot();

// Directories to skip while scanning
const SKIP_DIRS = new Set([
    'node_modules', '.next', '.git', 'prompts', 'prompts1',
    '.dockerignore', 'public', '.vercel', 'dist', 'build', '__pycache__'
]);

// Code file extensions to pick up
const CODE_EXTENSIONS = new Set(['.js', '.jsx', '.ts', '.tsx']);

// Prompt file extension
const PROMPT_EXTENSION = '.txt';

// ==========================================
// File scanning helpers
// ==========================================

/**
 * Recursively find ALL files (code + prompts) in the project root directories.
 * Returns { codeFiles: string[], promptFiles: string[] }
 */
function scanProjectFiles(rootDir) {
    const codeFiles = [];
    const promptFiles = [];

    function walk(dir) {
        try {
            const entries = fs.readdirSync(dir, { withFileTypes: true });
            for (const entry of entries) {
                const fullPath = path.join(dir, entry.name);

                if (entry.isDirectory()) {
                    if (!SKIP_DIRS.has(entry.name) && !entry.name.startsWith('.')) {
                        walk(fullPath);
                    }
                } else if (entry.isFile()) {
                    const ext = path.extname(entry.name).toLowerCase();
                    if (CODE_EXTENSIONS.has(ext)) {
                        codeFiles.push(fullPath);
                    } else if (ext === PROMPT_EXTENSION) {
                        promptFiles.push(fullPath);
                    }
                }
            }
        } catch (e) {
            console.error(`Error scanning directory ${dir}:`, e.message);
        }
    }

    walk(rootDir);
    return { codeFiles, promptFiles };
}

/**
 * For a given code file, try to find its matching .txt prompt file
 * e.g. app/login/page.js -> app/login/page.txt
 */
function findMatchingPromptFile(codeFilePath, promptFiles) {
    const baseName = codeFilePath.replace(/\.(js|jsx|ts|tsx)$/, '.txt');
    return promptFiles.find(pf => pf === baseName) || null;
}

/**
 * For a given prompt file, derive the target code file path
 * e.g. app/login/page.txt -> app/login/page.js
 */
function deriveCodeFileFromPrompt(promptFilePath, codeFiles) {
    const baseName = promptFilePath.replace(/\.txt$/, '');
    // Try each code extension
    for (const ext of CODE_EXTENSIONS) {
        const candidate = baseName + ext;
        if (codeFiles.includes(candidate)) {
            return candidate;
        }
    }
    // Default to .js if no matching code file found
    return baseName + '.js';
}

// Helper to count lines in a file
function countLines(filePath) {
    try {
        if (!fs.existsSync(filePath)) return 0;
        const content = fs.readFileSync(filePath, 'utf-8');
        return content.split(/\r\n|\r|\n/).length;
    } catch (e) {
        return 0;
    }
}

// Helper to read file content safely
function readFileSafe(filePath) {
    try {
        if (!fs.existsSync(filePath)) return null;
        return fs.readFileSync(filePath, 'utf-8');
    } catch (e) {
        console.warn(`Could not read file: ${filePath}`);
        return null;
    }
}

// ==========================================
// Prompt file parsing (same logic as before)
// ==========================================

function parsePromptFile(content) {
    const lines = content.split('\n');
    const sections = [];

    let currentSection = null;
    let currentPrompts = [];
    let inCodeBlock = false;

    const isSkipLine = (line) => {
        if (!line || line.length === 0) return true;
        if (/^[=\-\*_]{3,}$/.test(line)) return true;
        if (/^#[^#]/.test(line) || line === '#') return true;
        return false;
    };

    const isHeadingLine = (line) => {
        return /^[A-Z][A-Z\s]+:$/.test(line) || /^[A-Z][A-Z\s]+:\s*$/.test(line);
    };

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();

        if (line.startsWith('```')) {
            inCodeBlock = !inCodeBlock;
            continue;
        }

        if (inCodeBlock) continue;

        // Detect Section Header
        const sectionMatch = line.match(/^(?:SECTION|Section)\s*(\d+)[:.]?\s*(.*)$/i);

        if (sectionMatch) {
            if (currentSection) {
                sections.push({
                    ...currentSection,
                    prompts: currentPrompts
                });
            }

            const rawName = sectionMatch[2].trim();
            let name = rawName;
            let start = i + 1;

            let end = lines.length;
            for (let j = i + 1; j < lines.length; j++) {
                if (/^(?:SECTION|Section)\s*\d+[:.]?\s*/i.test(lines[j].trim())) {
                    end = j;
                    break;
                }
            }

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

        if (currentSection) {
            if (line.toLowerCase().startsWith('purpose:')) {
                currentSection.purpose = line.substring(8).trim();
                continue;
            }

            // NLP Prompts
            if (line.match(/^NLP_PROMPT:/i)) {
                const template = line.replace(/^NLP_PROMPT:/i, '').trim().replace(/^"|"$/g, '');
                let example = '';
                if (i + 1 < lines.length && lines[i + 1].trim().match(/^EXAMPLE:/i)) {
                    example = lines[i + 1].trim().replace(/^EXAMPLE:/i, '').trim().replace(/^"|"$/g, '');
                }
                currentPrompts.push({ template, example, lineNumber: i + 1, promptType: 'NLP' });
                continue;
            }

            // Developer Prompts
            if (line.match(/^DEV_PROMPT:/i)) {
                const template = line.replace(/^DEV_PROMPT:/i, '').trim().replace(/^"|"$/g, '');
                let example = '';
                if (i + 1 < lines.length && lines[i + 1].trim().match(/^EXAMPLE:/i)) {
                    example = lines[i + 1].trim().replace(/^EXAMPLE:/i, '').trim().replace(/^"|"$/g, '');
                }
                currentPrompts.push({ template, example, lineNumber: i + 1, promptType: 'DEVELOPER' });
                continue;
            }

            // Legacy PROMPT/TEMPLATE
            if (line.match(/^(PROMPT|TEMPLATE):/i)) {
                const template = line.replace(/^(PROMPT|TEMPLATE):/i, '').trim().replace(/^"|"$/g, '');
                let example = '';
                if (i + 1 < lines.length && lines[i + 1].trim().match(/^EXAMPLE:/i)) {
                    example = lines[i + 1].trim().replace(/^EXAMPLE:/i, '').trim().replace(/^"|"$/g, '');
                }
                currentPrompts.push({ template, example, lineNumber: i + 1, promptType: 'NLP' });
                continue;
            }

            if (isSkipLine(line)) continue;

            // Numbered items
            const numberedMatch = line.match(/^(\d+)\.\s+(.+)$/);
            if (numberedMatch) {
                let template = numberedMatch[2].trim();
                let details = [];
                let j = i + 1;
                while (j < lines.length) {
                    const nextLine = lines[j].trim();
                    if (/^\d+\.\s+/.test(nextLine) || /^(?:SECTION|Section)\s*\d+/i.test(nextLine)) break;
                    if (isHeadingLine(nextLine)) break;
                    if (nextLine.startsWith('-') || nextLine.startsWith('•')) {
                        details.push(nextLine.replace(/^[\-•]\s*/, ''));
                    }
                    j++;
                }
                if (details.length > 0) {
                    template = `${template}: ${details.join('; ')}`;
                }
                currentPrompts.push({ template, example: '', lineNumber: i + 1, promptType: 'NLP' });
                continue;
            }

            // Action items (► > etc.)
            const actionMatch = line.match(/^[►>]\s+(.+)$/);
            if (actionMatch) {
                let template = actionMatch[1].trim();
                let details = [];
                let j = i + 1;
                while (j < lines.length && j < i + 5) {
                    const nextLine = lines[j].trim();
                    if (/^[►>]\s+/.test(nextLine) || /^(?:SECTION|Section)\s*\d+/i.test(nextLine)) break;
                    if (/^\d+\.\s+/.test(nextLine)) break;
                    if (nextLine.startsWith('-') && !nextLine.startsWith('---')) {
                        details.push(nextLine.replace(/^-\s*/, ''));
                    }
                    j++;
                }
                if (details.length > 0) {
                    template = `${template} ${details.join(' | ')}`;
                }
                currentPrompts.push({ template, example: '', lineNumber: i + 1, promptType: 'NLP' });
                continue;
            }

            // Table rows
            if (line.startsWith('|') && line.endsWith('|') && !line.match(/^\|[\-\s\|]+\|$/)) {
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

            // ### headings
            const topicMatch = line.match(/^###?\s+(.+)$/);
            if (topicMatch) {
                let template = topicMatch[1].trim();
                let details = [];
                let j = i + 1;
                while (j < lines.length && j < i + 10) {
                    const nextLine = lines[j].trim();
                    if (/^###?\s+/.test(nextLine)) break;
                    if (/^(?:SECTION|Section)\s*\d+/i.test(nextLine)) break;
                    if (nextLine && !isSkipLine(nextLine) && !nextLine.startsWith('```')) {
                        if (details.length < 3) details.push(nextLine);
                    }
                    j++;
                }
                currentPrompts.push({
                    template,
                    example: details.length > 0 ? details[0] : '',
                    lineNumber: i + 1,
                    promptType: 'DEVELOPER'
                });
                continue;
            }

            // All-caps heading
            const capsHeadingMatch = line.match(/^([A-Z][A-Z\s]+):$/);
            if (capsHeadingMatch && !/^(PURPOSE|SECTION|IMPORTS|FILE|END):/i.test(line)) {
                currentPrompts.push({
                    template: capsHeadingMatch[1].trim(),
                    example: '',
                    lineNumber: i + 1,
                    promptType: 'NLP'
                });
                continue;
            }
        }
    }

    if (currentSection) {
        sections.push({
            ...currentSection,
            prompts: currentPrompts
        });
    }

    return sections;
}

// Parse Master NLP Prompt
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

// ==========================================
// POST seed database - Sync All Prompts
// Scans ALL folders in project root
// ==========================================
router.post('/', async (req, res) => {
    try {
        console.log(`\n🔄 Starting full project sync...`);
        console.log(`📁 Project root: ${PROJECT_ROOT}`);

        if (!fs.existsSync(PROJECT_ROOT)) {
            return res.status(404).json({ error: `Project root not found: ${PROJECT_ROOT}` });
        }

        // Scan all files in the project root
        const { codeFiles, promptFiles } = scanProjectFiles(PROJECT_ROOT);

        console.log(`📂 Found ${codeFiles.length} code files`);
        console.log(`📝 Found ${promptFiles.length} prompt files`);

        const processed = [];
        const processedCodePaths = new Set(); // Track which code files we've already processed

        // ==========================================
        // PHASE 1: Process prompt (.txt) files 
        // These get full prompt parsing + link to code
        // ==========================================
        for (const promptFilePath of promptFiles) {
            const promptContent = readFileSafe(promptFilePath);
            if (!promptContent) continue;

            const fileName = path.basename(promptFilePath);

            // Handle MASTER prompts
            if (fileName.includes('MASTER') || promptContent.includes('MASTER NLP PROMPT')) {
                const targetFilePathRelative = extractTargetFile(promptContent, promptFilePath);
                const parsedMaster = parseMasterPrompt(promptContent);
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

            // Find matching code file for this prompt
            const matchingCodeFile = findMatchingPromptFile(promptFilePath, codeFiles.map(cf => cf))
                ? promptFilePath.replace(/\.txt$/, '.js')
                : deriveCodeFileFromPrompt(promptFilePath, codeFiles);

            const targetFilePathRelative = path.relative(PROJECT_ROOT, matchingCodeFile).replace(/\\/g, '/');
            const targetFilePathAbsolute = matchingCodeFile.includes(':')
                ? matchingCodeFile
                : path.join(PROJECT_ROOT, targetFilePathRelative.split('/').join(path.sep));

            // Parse prompt sections
            const sections = parsePromptFile(promptContent);
            if (sections.length === 0) {
                console.log(`  ⏩ Skipping ${fileName}: No sections found`);
            }

            const actualTotalLines = countLines(targetFilePathAbsolute);

            // Read the actual source code
            const sourceCode = readFileSafe(targetFilePathAbsolute);

            // Delete existing page entry to do a full refresh
            await prisma.page.deleteMany({ where: { filePath: targetFilePathRelative } });

            const jsFileName = path.basename(targetFilePathRelative);
            const componentName = jsFileName.replace(/\.(js|jsx|ts|tsx)$/, '');

            // Store both prompt content AND source code
            await prisma.page.create({
                data: {
                    filePath: targetFilePathRelative,
                    componentName: componentName,
                    totalLines: actualTotalLines || 0,
                    purpose: `Prompt file for ${jsFileName}`,
                    promptFilePath: promptFilePath,
                    rawContent: promptContent,
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

            processedCodePaths.add(targetFilePathRelative);
            processed.push({
                file: fileName,
                type: 'page',
                target: targetFilePathRelative,
                lines: actualTotalLines,
                sections: sections.length,
                hasCode: !!sourceCode,
                hasPrompt: true
            });
        }

        // ==========================================
        // PHASE 2: Process code files WITHOUT prompts
        // These are code-only entries (components, lib, contexts, etc.)
        // ==========================================
        for (const codeFilePath of codeFiles) {
            const relPath = path.relative(PROJECT_ROOT, codeFilePath).replace(/\\/g, '/');

            // Skip if already processed via prompt file
            if (processedCodePaths.has(relPath)) continue;

            // Skip config files in the root (next.config.js, tailwind.config.js, etc.)
            const parts = relPath.split('/');
            if (parts.length === 1) {
                // Root-level file, skip config files
                const rootFileName = parts[0].toLowerCase();
                if (rootFileName.includes('config') || rootFileName.includes('env') || rootFileName === 'jsconfig.json') {
                    continue;
                }
            }

            const sourceCode = readFileSafe(codeFilePath);
            if (!sourceCode) continue;

            const totalLines = sourceCode.split(/\r\n|\r|\n/).length;
            const fileName = path.basename(codeFilePath);
            const componentName = fileName.replace(/\.(js|jsx|ts|tsx)$/, '');

            // Determine folder for grouping
            const folderPath = relPath.substring(0, relPath.lastIndexOf('/')) || 'root';

            // Delete existing entry for refresh
            await prisma.page.deleteMany({ where: { filePath: relPath } });

            // Create page entry with source code as rawContent
            await prisma.page.create({
                data: {
                    filePath: relPath,
                    componentName: componentName,
                    totalLines: totalLines,
                    purpose: `Source code: ${folderPath}/${fileName}`,
                    promptFilePath: null,
                    rawContent: sourceCode,
                    sections: {
                        create: [] // No prompt sections for code-only files
                    }
                }
            });

            processedCodePaths.add(relPath);
            processed.push({
                file: fileName,
                type: 'code',
                target: relPath,
                lines: totalLines,
                sections: 0,
                hasCode: true,
                hasPrompt: false
            });
        }

        // Summary
        const promptCount = processed.filter(p => p.type === 'page').length;
        const codeOnlyCount = processed.filter(p => p.type === 'code').length;
        const masterCount = processed.filter(p => p.type === 'master').length;

        console.log(`\n✅ Sync complete!`);
        console.log(`   📝 ${promptCount} files with prompts`);
        console.log(`   💻 ${codeOnlyCount} code-only files`);
        console.log(`   🎯 ${masterCount} master prompts`);
        console.log(`   📊 ${processed.length} total entries\n`);

        res.json({
            success: true,
            processed,
            summary: {
                total: processed.length,
                withPrompts: promptCount,
                codeOnly: codeOnlyCount,
                masterPrompts: masterCount
            }
        });
    } catch (error) {
        console.error('Seed error:', error);
        res.status(500).json({ error: 'Failed to seed database', details: error.message });
    }
});

// ==========================================
// GET /check-sync - Check if root folder is in sync with DB
// Does NOT modify anything, read-only comparison
// ==========================================
router.get('/check-sync', async (req, res) => {
    try {
        if (!fs.existsSync(PROJECT_ROOT)) {
            return res.json({
                success: true,
                inSync: false,
                message: 'Project root not found',
                details: { newFiles: [], removedFiles: [], modifiedFiles: [] }
            });
        }

        // Scan current files on disk
        const { codeFiles, promptFiles } = scanProjectFiles(PROJECT_ROOT);

        // Get all disk file paths (relative)
        const diskPromptPaths = new Set();
        for (const pf of promptFiles) {
            const fileName = path.basename(pf);
            if (fileName.includes('MASTER') || readFileSafe(pf)?.includes('MASTER NLP PROMPT')) {
                continue; // skip master prompts for this comparison
            }
            // Derive the code file path that would be stored in DB
            const matchingCodeFile = deriveCodeFileFromPrompt(pf, codeFiles);
            const relPath = path.relative(PROJECT_ROOT, matchingCodeFile).replace(/\\/g, '/');
            diskPromptPaths.add(relPath);
        }

        const diskCodePaths = new Set();
        for (const cf of codeFiles) {
            const relPath = path.relative(PROJECT_ROOT, cf).replace(/\\/g, '/');
            // Skip root-level config files (same logic as seed)
            const parts = relPath.split('/');
            if (parts.length === 1) {
                const rootFileName = parts[0].toLowerCase();
                if (rootFileName.includes('config') || rootFileName.includes('env') || rootFileName === 'jsconfig.json') {
                    continue;
                }
            }
            diskCodePaths.add(relPath);
        }

        const allDiskPaths = new Set([...diskPromptPaths, ...diskCodePaths]);

        // Get all DB file paths
        const dbPages = await prisma.page.findMany({
            select: { filePath: true, updatedAt: true, promptFilePath: true }
        });
        const dbPaths = new Set(dbPages.map(p => p.filePath));

        // Compare
        const newFiles = []; // on disk but not in DB
        const removedFiles = []; // in DB but not on disk
        const modifiedFiles = []; // on disk AND in DB but prompt file changed

        // Check for new files on disk not in DB
        for (const diskPath of allDiskPaths) {
            if (!dbPaths.has(diskPath)) {
                newFiles.push(diskPath);
            }
        }

        // Check for files in DB no longer on disk
        for (const dbPath of dbPaths) {
            if (!allDiskPaths.has(dbPath)) {
                removedFiles.push(dbPath);
            }
        }

        // Check for modified prompt files (compare file mtime vs DB updatedAt)
        for (const dbPage of dbPages) {
            if (dbPage.promptFilePath && allDiskPaths.has(dbPage.filePath)) {
                try {
                    if (fs.existsSync(dbPage.promptFilePath)) {
                        const fileStat = fs.statSync(dbPage.promptFilePath);
                        const fileMtime = fileStat.mtime;
                        const dbUpdated = new Date(dbPage.updatedAt);
                        // If the file on disk was modified after the DB record
                        if (fileMtime > dbUpdated) {
                            modifiedFiles.push(dbPage.filePath);
                        }
                    }
                } catch (e) {
                    // Ignore stat errors
                }
            }
        }

        const totalChanges = newFiles.length + removedFiles.length + modifiedFiles.length;
        const inSync = totalChanges === 0;

        let message = '';
        if (inSync) {
            message = 'Everything is in sync';
        } else {
            const parts = [];
            if (newFiles.length > 0) parts.push(`${newFiles.length} new file(s)`);
            if (modifiedFiles.length > 0) parts.push(`${modifiedFiles.length} modified file(s)`);
            if (removedFiles.length > 0) parts.push(`${removedFiles.length} removed file(s)`);
            message = `Root folder has changes: ${parts.join(', ')}`;
        }

        res.json({
            success: true,
            inSync,
            totalChanges,
            message,
            details: {
                newFiles,
                removedFiles,
                modifiedFiles
            }
        });
    } catch (error) {
        console.error('Check-sync error:', error);
        res.status(500).json({
            success: false,
            inSync: true, // Default to in-sync on error to not show false warnings
            message: 'Failed to check sync status'
        });
    }
});

module.exports = router;
