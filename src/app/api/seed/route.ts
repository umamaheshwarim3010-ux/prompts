import { prisma } from '@/lib/prisma'
import { NextResponse } from 'next/server'
import fs from 'fs'
import path from 'path'

const PROJECT_ROOT = 'C:\\SNIX\\sify\\HrAssist\\exam'
const APP_DIR = path.join(PROJECT_ROOT, 'app')

interface PromptSection {
    name: string
    startLine: number
    endLine: number
    purpose: string
    prompts: { template: string; example: string; lineNumber: number }[]
}

// Recursively find text files
function getFilesRecursively(dir: string): string[] {
    let results: string[] = []
    try {
        const list = fs.readdirSync(dir)
        list.forEach(file => {
            const filePath = path.join(dir, file)
            const stat = fs.statSync(filePath)
            if (stat && stat.isDirectory()) {
                if (file !== 'node_modules' && file !== '.next' && file !== 'prompts') {
                    results = results.concat(getFilesRecursively(filePath))
                }
            } else {
                if (file.endsWith('.txt')) {
                    results.push(filePath)
                }
            }
        })
    } catch (e) {
        console.error(`Error scanning directory ${dir}:`, e)
    }
    return results
}

// Robust text file parser
function parsePromptFile(content: string) {
    const lines = content.split('\n')
    const sections: PromptSection[] = []

    let currentSection: Partial<PromptSection> | null = null
    let currentPrompts: { template: string; example: string; lineNumber: number }[] = []

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim()

        // Detect Section Header: "SECTION X: NAME (Lines start-end)" or "SECTION X: NAME"
        const sectionMatch = line.match(/(?:SECTION|Section)\s*\d+[:.]\s*(.+?)(?:\s*\(Lines\s*(\d+)-(\d+)\))?$/i)

        if (sectionMatch) {
            // Save previous section
            if (currentSection) {
                sections.push({
                    ...currentSection as PromptSection,
                    prompts: currentPrompts
                })
            }

            const name = sectionMatch[1].trim()
            const start = sectionMatch[2] ? parseInt(sectionMatch[2]) : i + 1
            const end = sectionMatch[3] ? parseInt(sectionMatch[3]) : i + 50

            currentSection = {
                name,
                startLine: start,
                endLine: end,
                purpose: 'Section Purpose'
            }
            currentPrompts = []
        }

        // Look for content
        if (currentSection) {
            if (line.toLowerCase().startsWith('purpose:')) {
                currentSection.purpose = line.substring(8).trim()
            } else if (line.match(/^(PROMPT|TEMPLATE):/i)) {
                // i + 1 is the 1-based line number
                const promptLineNum = i + 1
                const template = line.replace(/^(PROMPT|TEMPLATE):/i, '').trim().replace(/^"|"$/g, '')
                // Look ahead for EXAMPLE
                let example = ''
                if (i + 1 < lines.length && lines[i + 1].trim().match(/^EXAMPLE:/i)) {
                    example = lines[i + 1].trim().replace(/^EXAMPLE:/i, '').trim().replace(/^"|"$/g, '')
                }
                currentPrompts.push({ template, example, lineNumber: promptLineNum })
            }
        }
    }

    // Push last section
    if (currentSection) {
        sections.push({
            ...currentSection as PromptSection,
            prompts: currentPrompts
        })
    }

    return sections
}

// Function to Parse Master NLP Prompt specifically
function parseMasterPrompt(content: string) {
    const nlpInstructionMatch = content.match(/INSTRUCTION SYNTAX:\s*([\s\S]*?)AVAILABLE SECTIONS:/)
    const nlpInstruction = nlpInstructionMatch ? nlpInstructionMatch[1].trim().replace(/"/g, '') : "Modify [SECTION] to [ACTION] at line [LINE]"

    const summaryMatch = content.match(/AVAILABLE SECTIONS:\s*([\s\S]*?)QUERY EXAMPLES:/)
    const sectionsSummary = summaryMatch ? summaryMatch[1].trim() : "See details"

    const examplesMatch = content.match(/QUERY EXAMPLES:\s*([\s\S]*?)METADATA SOURCE:/)
    const queryExamples = examplesMatch ? examplesMatch[1].trim() : ""

    return { nlpInstruction, sectionsSummary, queryExamples }
}

function extractTargetFile(content: string, fullPath: string): string {
    // Try to find "FILE: app/..."
    const match = content.match(/FILE:\s*([^\s|]+)/i)
    if (match) {
        // Normalize path separators to forward slash
        return match[1].trim().replace(/\\/g, '/')
    }

    // Fallback: use filesystem path relative to project root
    // remove PROJECT_ROOT from fullPath
    let relative = path.relative(PROJECT_ROOT, fullPath)
    // replace .txt with .js
    relative = relative.replace(/\.txt$/, '.js')
    return relative.replace(/\\/g, '/')
}

export async function POST() {
    try {
        if (!fs.existsSync(APP_DIR)) {
            return NextResponse.json({ error: `Directory not found: ${APP_DIR}` }, { status: 404 })
        }

        const files = getFilesRecursively(APP_DIR)
        const processed = []

        for (const filePath of files) {
            const content = fs.readFileSync(filePath, 'utf-8')
            const fileName = path.basename(filePath)

            // Determine target JS file (e.g. app/dashboard/page.js)
            const targetFilePath = extractTargetFile(content, filePath)

            // Handle MASTER_PROMPT or generic master prompts
            if (fileName.includes('MASTER') || content.includes('MASTER NLP PROMPT')) {
                const parsedMaster = parseMasterPrompt(content)
                await prisma.masterPrompt.upsert({
                    where: { pageFilePath: targetFilePath },
                    update: parsedMaster,
                    create: {
                        pageFilePath: targetFilePath,
                        ...parsedMaster
                    }
                })
                processed.push({ file: fileName, type: 'master', target: targetFilePath })
                continue
            }

            // Handle regular prompt files
            const sections = parsePromptFile(content)

            // If no sections found, skip (likely not a prompt file)
            if (sections.length === 0) continue

            // Delete existing page entry to full refresh
            await prisma.page.deleteMany({ where: { filePath: targetFilePath } })

            // Create new page entry
            const jsFileName = path.basename(targetFilePath)
            const componentName = jsFileName.replace(/\.(js|jsx|ts|tsx)$/, '')

            await prisma.page.create({
                data: {
                    filePath: targetFilePath,
                    componentName: componentName,
                    totalLines: 1000,
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
            })
            processed.push({ file: fileName, type: 'page', target: targetFilePath })
        }

        return NextResponse.json({ success: true, processed })
    } catch (error) {
        console.error('Seed error:', error)
        return NextResponse.json({ error: 'Failed to seed database' }, { status: 500 })
    }
}
