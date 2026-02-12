'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { apiRequest, getAccessToken, clearAuthData } from '@/lib/api'
import { ThemeToggle } from '@/components/ThemeToggle'

// API Base URL from environment variable
const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000'

// --- Types ---
interface Prompt {
    id: string
    template: string
    example: string | null
    description: string | null
    lineNumber: number
    promptType: 'NLP' | 'DEVELOPER'
}

interface Section {
    id: string
    name: string
    startLine: number
    endLine: number
    purpose: string
    prompts: Prompt[]
}

interface StateVar {
    id: string
    name: string
    line: number
    type: string | null
    description: string | null
}

interface PageFunc {
    id: string
    name: string
    startLine: number
    endLine: number
    purpose: string | null
}

interface Page {
    id: string
    filePath: string
    componentName: string
    totalLines: number
    purpose: string
    rawContent: string | null
    promptFilePath: string | null
    sections: Section[]
    stateVars: StateVar[]
    functions: PageFunc[]
}

interface MasterPrompt {
    id: string
    pageFilePath: string
    nlpInstruction: string
    sectionsSummary: string
    queryExamples: string
}

// --- Components ---

const CopyButton = ({ text }: { text: string }) => {
    const [copied, setCopied] = useState(false)

    const handleCopy = (e: React.MouseEvent) => {
        e.stopPropagation()
        navigator.clipboard.writeText(text)
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
    }

    return (
        <button
            onClick={handleCopy}
            className={`text-xs px-2 py-1 rounded transition-colors border ${copied
                ? 'bg-green-500/20 text-green-700 dark:text-green-300 border-green-500/30'
                : 'bg-slate-200 dark:bg-white/5 text-gray-500 dark:text-gray-400 border-slate-200 dark:border-white/10 hover:bg-slate-300 dark:bg-white/10 hover:text-slate-900 dark:text-white'
                }`}
        >
            {copied ? '✓ Copied' : 'Copy'}
        </button>
    )
}

const Badge = ({ children, color = 'blue' }: { children: React.ReactNode, color?: 'blue' | 'purple' | 'green' | 'amber' | 'red' }) => {
    const colors = {
        blue: 'bg-blue-500/10 text-blue-700 dark:text-blue-300 border-blue-500/20',
        purple: 'bg-purple-500/10 text-purple-700 dark:text-purple-300 border-purple-500/20',
        green: 'bg-green-500/10 text-green-700 dark:text-green-300 border-green-500/20',
        amber: 'bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/20',
        red: 'bg-red-500/10 text-red-700 dark:text-red-300 border-red-500/20',
    }

    return (
        <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border ${colors[color]}`}>
            {children}
        </span>
    )
}

// --- Tree View Types & Helpers ---

interface TreeNode {
    name: string
    fullPath: string
    children: TreeNode[]
    pages: Page[]
}

const buildTree = (groupedPages: Record<string, Page[]>): TreeNode[] => {
    const root: TreeNode = { name: '', fullPath: '', children: [], pages: [] }
    const sortedPaths = Object.keys(groupedPages).sort()

    for (const folderPath of sortedPaths) {
        const parts = folderPath.split('/').filter(Boolean)
        let current = root

        for (let i = 0; i < parts.length; i++) {
            const partPath = parts.slice(0, i + 1).join('/')
            let child = current.children.find(c => c.fullPath === partPath)
            if (!child) {
                child = { name: parts[i], fullPath: partPath, children: [], pages: [] }
                current.children.push(child)
            }
            current = child
        }
        current.pages = groupedPages[folderPath] || []
    }

    return root.children
}

const countTreeStats = (node: TreeNode): { files: number; lines: number; sections: number; prompts: number } => {
    let files = node.pages.length
    let lines = node.pages.reduce((s, p) => s + p.totalLines, 0)
    let sections = node.pages.reduce((s, p) => s + p.sections.length, 0)
    let prompts = node.pages.reduce((s, p) => s + p.sections.reduce((ps, sec) => ps + sec.prompts.length, 0), 0)
    for (const child of node.children) {
        const cs = countTreeStats(child)
        files += cs.files; lines += cs.lines; sections += cs.sections; prompts += cs.prompts
    }
    return { files, lines, sections, prompts }
}

const getAllPaths = (nodes: TreeNode[]): string[] => {
    const paths: string[] = []
    for (const n of nodes) {
        paths.push(n.fullPath)
        paths.push(...getAllPaths(n.children))
    }
    return paths
}
const FolderIcon = ({ open }: { open: boolean }) => (
    <span className="tree-icon">
        {open ? (
            <svg viewBox="0 0 24 24" fill="none">
                <path d="M2 6a2 2 0 012-2h5l2 2h9a2 2 0 012 2v2H2V6z" fill="#dcb67a" />
                <path d="M2 10h20v8a2 2 0 01-2 2H4a2 2 0 01-2-2V10z" fill="#e8c97a" opacity="0.9" />
            </svg>
        ) : (
            <svg viewBox="0 0 24 24" fill="none">
                <path d="M4 4a2 2 0 00-2 2v12a2 2 0 002 2h16a2 2 0 002-2V8a2 2 0 00-2-2h-8l-2-2H4z" fill="#c09553" />
            </svg>
        )}
    </span>
)

const FileIcon = ({ filePath }: { filePath: string }) => {
    const ext = filePath.split('.').pop()?.toLowerCase() || ''
    const name = filePath.split('/').pop()?.toLowerCase() || ''

    // TSX/JSX - React blue with atom symbol
    if (['tsx', 'jsx'].includes(ext)) return (
        <span className="tree-icon">
            <svg viewBox="0 0 24 24" fill="none">
                <rect x="3" y="1" width="18" height="22" rx="2" fill="#1c2c4c" opacity="0.9" />
                <circle cx="12" cy="12" r="2.5" fill="#61dafb" />
                <ellipse cx="12" cy="12" rx="8" ry="3" stroke="#61dafb" strokeWidth="1" fill="none" opacity="0.7" />
                <ellipse cx="12" cy="12" rx="8" ry="3" stroke="#61dafb" strokeWidth="1" fill="none" opacity="0.7" transform="rotate(60 12 12)" />
                <ellipse cx="12" cy="12" rx="8" ry="3" stroke="#61dafb" strokeWidth="1" fill="none" opacity="0.7" transform="rotate(-60 12 12)" />
            </svg>
        </span>
    )

    // TypeScript - blue square with TS
    if (ext === 'ts') return (
        <span className="tree-icon">
            <svg viewBox="0 0 24 24" fill="none">
                <rect x="2" y="2" width="20" height="20" rx="2" fill="#3178c6" />
                <text x="12" y="16" textAnchor="middle" fontSize="10" fontWeight="bold" fill="#fff" fontFamily="monospace">TS</text>
            </svg>
        </span>
    )

    // JavaScript - yellow square with JS
    if (ext === 'js' || ext === 'mjs' || ext === 'cjs') return (
        <span className="tree-icon">
            <svg viewBox="0 0 24 24" fill="none">
                <rect x="2" y="2" width="20" height="20" rx="2" fill="#f7df1e" />
                <text x="12" y="16" textAnchor="middle" fontSize="10" fontWeight="bold" fill="#333" fontFamily="monospace">JS</text>
            </svg>
        </span>
    )

    // CSS - purple/blue shield
    if (ext === 'css' || ext === 'scss' || ext === 'sass') return (
        <span className="tree-icon">
            <svg viewBox="0 0 24 24" fill="none">
                <path d="M4 2h16l-2 19-6 3-6-3L4 2z" fill="#264de4" opacity="0.9" />
                <path d="M12 4v18l4.5-2.25L18 4H12z" fill="#2965f1" opacity="0.7" />
                <text x="12" y="15" textAnchor="middle" fontSize="7" fontWeight="bold" fill="#fff" fontFamily="sans-serif">CSS</text>
            </svg>
        </span>
    )

    // JSON - curly braces icon
    if (ext === 'json') return (
        <span className="tree-icon">
            <svg viewBox="0 0 24 24" fill="none">
                <rect x="3" y="1" width="18" height="22" rx="2" fill="#292929" />
                <text x="12" y="16" textAnchor="middle" fontSize="14" fontWeight="bold" fill="#f5a623" fontFamily="monospace">{'{}'}</text>
            </svg>
        </span>
    )

    // Prisma - prisma diamond
    if (ext === 'prisma') return (
        <span className="tree-icon">
            <svg viewBox="0 0 24 24" fill="none">
                <path d="M12 2L3 9l3 11h12l3-11L12 2z" fill="#5a67d8" opacity="0.9" />
                <path d="M12 2l9 7-3 11H6L3 9l9-7z" stroke="#7c8ce8" strokeWidth="0.5" fill="none" />
                <path d="M12 6l5 4-2 6H9L7 10l5-4z" fill="#818cf8" opacity="0.6" />
            </svg>
        </span>
    )

    // Database files (.db, .sqlite)
    if (ext === 'db' || ext === 'sqlite' || ext === 'sqlite3') return (
        <span className="tree-icon">
            <svg viewBox="0 0 24 24" fill="none">
                <ellipse cx="12" cy="6" rx="8" ry="3" fill="#4ade80" />
                <path d="M4 6v12c0 1.66 3.58 3 8 3s8-1.34 8-3V6" fill="none" stroke="#4ade80" strokeWidth="1.5" />
                <ellipse cx="12" cy="12" rx="8" ry="3" fill="none" stroke="#4ade80" strokeWidth="1" opacity="0.5" />
                <ellipse cx="12" cy="18" rx="8" ry="3" fill="#4ade80" opacity="0.3" />
            </svg>
        </span>
    )

    // Markdown
    if (ext === 'md' || ext === 'mdx') return (
        <span className="tree-icon">
            <svg viewBox="0 0 24 24" fill="none">
                <rect x="2" y="3" width="20" height="18" rx="2" fill="#1a1a2e" stroke="#519aba" strokeWidth="1" />
                <text x="12" y="16" textAnchor="middle" fontSize="10" fontWeight="bold" fill="#519aba" fontFamily="monospace">M↓</text>
            </svg>
        </span>
    )

    // Environment files
    if (ext === 'env' || name.startsWith('.env')) return (
        <span className="tree-icon">
            <svg viewBox="0 0 24 24" fill="none">
                <rect x="3" y="1" width="18" height="22" rx="2" fill="#2d2a1e" />
                <circle cx="8" cy="8" r="2" fill="#ecd53f" />
                <rect x="12" y="7" width="7" height="2" rx="1" fill="#ecd53f" opacity="0.6" />
                <circle cx="8" cy="14" r="2" fill="#ecd53f" opacity="0.8" />
                <rect x="12" y="13" width="5" height="2" rx="1" fill="#ecd53f" opacity="0.5" />
            </svg>
        </span>
    )

    // Text files
    if (ext === 'txt' || ext === 'log') return (
        <span className="tree-icon">
            <svg viewBox="0 0 24 24" fill="none">
                <path d="M5 1h10l4 4v16a2 2 0 01-2 2H5a2 2 0 01-2-2V3a2 2 0 012-2z" fill="#555" />
                <path d="M15 1l4 4h-3a1 1 0 01-1-1V1z" fill="#777" />
                <rect x="6" y="9" width="10" height="1.5" rx="0.5" fill="#999" opacity="0.5" />
                <rect x="6" y="12.5" width="8" height="1.5" rx="0.5" fill="#999" opacity="0.4" />
                <rect x="6" y="16" width="10" height="1.5" rx="0.5" fill="#999" opacity="0.3" />
            </svg>
        </span>
    )

    // HTML
    if (ext === 'html' || ext === 'htm') return (
        <span className="tree-icon">
            <svg viewBox="0 0 24 24" fill="none">
                <path d="M4 2h16l-2 19-6 3-6-3L4 2z" fill="#e34c26" opacity="0.9" />
                <path d="M12 4v18l4.5-2.25L18 4H12z" fill="#f06529" opacity="0.7" />
                <text x="12" y="15" textAnchor="middle" fontSize="5" fontWeight="bold" fill="#fff" fontFamily="sans-serif">{'<>'}</text>
            </svg>
        </span>
    )

    // Git files
    if (name === '.gitignore' || ext === 'gitignore') return (
        <span className="tree-icon">
            <svg viewBox="0 0 24 24" fill="none">
                <circle cx="12" cy="12" r="9" fill="#f05033" />
                <circle cx="12" cy="12" r="4" fill="#fff" />
                <circle cx="12" cy="12" r="2" fill="#f05033" />
            </svg>
        </span>
    )

    // YAML/YML
    if (ext === 'yml' || ext === 'yaml') return (
        <span className="tree-icon">
            <svg viewBox="0 0 24 24" fill="none">
                <rect x="3" y="1" width="18" height="22" rx="2" fill="#cb171e" opacity="0.85" />
                <text x="12" y="15" textAnchor="middle" fontSize="7" fontWeight="bold" fill="#fff" fontFamily="monospace">yml</text>
            </svg>
        </span>
    )

    // Lock files
    if (name.includes('lock')) return (
        <span className="tree-icon">
            <svg viewBox="0 0 24 24" fill="none">
                <rect x="5" y="10" width="14" height="12" rx="2" fill="#888" />
                <path d="M8 10V7a4 4 0 018 0v3" stroke="#888" strokeWidth="2" fill="none" />
                <circle cx="12" cy="16" r="2" fill="#555" />
            </svg>
        </span>
    )

    // Default file icon
    let color = '#8b8b8b'
    if (ext === 'py') color = '#3572A5'
    else if (ext === 'go') color = '#00ADD8'
    else if (ext === 'rs') color = '#dea584'
    else if (ext === 'java') color = '#b07219'
    else if (ext === 'svg') color = '#ffb13b'
    else if (ext === 'png' || ext === 'jpg' || ext === 'gif' || ext === 'webp') color = '#a4c639'

    return (
        <span className="tree-icon">
            <svg viewBox="0 0 24 24" fill="none">
                <path d="M5 1h10l4 4v16a2 2 0 01-2 2H5a2 2 0 01-2-2V3a2 2 0 012-2z" fill={color} opacity="0.85" />
                <path d="M15 1l4 4h-3a1 1 0 01-1-1V1z" fill={color} opacity="0.5" />
            </svg>
        </span>
    )
}

const FileTreeNode = ({ node, depth, expandedNodes, onToggleNode, onNavigateToFile, onGenerate, generatingFile, searchQuery, selectedPageId }: {
    node: TreeNode
    depth: number
    expandedNodes: Set<string>
    onToggleNode: (path: string) => void
    onNavigateToFile: (pageId: string) => void
    onGenerate: (filePath: string) => void
    generatingFile: string | null
    searchQuery: string
    selectedPageId: string | null
}) => {
    const isExpanded = expandedNodes.has(node.fullPath) || !!searchQuery
    const hasChildren = node.children.length > 0
    const hasPages = node.pages.length > 0
    const stats = countTreeStats(node)
    const hasUnprompted = node.pages.some(p => !p.promptFilePath && p.sections.length === 0)

    const sortedPages = [...node.pages].sort((a, b) => {
        const aHas = a.promptFilePath || a.sections.length > 0
        const bHas = b.promptFilePath || b.sections.length > 0
        if (!aHas && bHas) return -1
        if (aHas && !bHas) return 1
        return a.componentName.localeCompare(b.componentName)
    })

    const sortedChildren = [...node.children].sort((a, b) => {
        const aNo = a.pages.some(p => !p.promptFilePath && p.sections.length === 0)
        const bNo = b.pages.some(p => !p.promptFilePath && p.sections.length === 0)
        if (aNo && !bNo) return -1
        if (!aNo && bNo) return 1
        return a.name.localeCompare(b.name)
    })

    return (
        <div>
            <div className="tree-node-row" onClick={() => onToggleNode(node.fullPath)} title={node.fullPath}>
                {Array.from({ length: depth }).map((_, i) => (
                    <span key={i} className="tree-indent-guide" />
                ))}
                <span className={`tree-chevron ${(hasChildren || hasPages) ? (isExpanded ? 'expanded' : '') : 'hidden-chevron'}`}>
                    <svg width="7" height="7" viewBox="0 0 7 7"><path d="M1 0.5L5.5 3.5L1 6.5V0.5Z" fill="currentColor" /></svg>
                </span>
                <FolderIcon open={isExpanded} />
                <span className="tree-label folder">{node.name}</span>
                {hasUnprompted && <span className="tree-dot modified" title="Has files without prompts" />}
                <span className="tree-badge">
                    <span className="tree-badge-val">{stats.files}</span>
                </span>
            </div>
            {isExpanded && (
                <div className="tree-children">
                    {sortedChildren.map(child => (
                        <FileTreeNode key={child.fullPath} node={child} depth={depth + 1} expandedNodes={expandedNodes}
                            onToggleNode={onToggleNode} onNavigateToFile={onNavigateToFile}
                            onGenerate={onGenerate} generatingFile={generatingFile} searchQuery={searchQuery} selectedPageId={selectedPageId} />
                    ))}
                    {sortedPages.map(page => {
                        const hasPrompt = page.promptFilePath || page.sections.length > 0
                        return (
                            <div key={page.id} className={`tree-node-row ${selectedPageId === page.id ? 'selected' : ''}`} onClick={() => onNavigateToFile(page.id)} title={page.filePath}>
                                {Array.from({ length: depth + 1 }).map((_, i) => (
                                    <span key={i} className="tree-indent-guide" />
                                ))}
                                <span className="tree-chevron hidden-chevron">
                                    <svg width="7" height="7" viewBox="0 0 7 7"><path d="M1 0.5L5.5 3.5L1 6.5V0.5Z" fill="currentColor" /></svg>
                                </span>
                                <FileIcon filePath={page.filePath} />
                                <span className="tree-label file">{page.componentName}</span>
                                <span className={`tree-dot ${hasPrompt ? 'tracked' : 'modified'}`}
                                    title={hasPrompt ? 'Has prompts' : 'No prompts yet'} />
                                {!hasPrompt && (
                                    <button onClick={(e) => { e.stopPropagation(); onGenerate(page.filePath) }}
                                        disabled={generatingFile === page.filePath}
                                        className={`tree-gen-btn ${generatingFile === page.filePath ? 'busy' : ''}`}
                                        title="Generate NLP & Developer prompts from code">
                                        {generatingFile === page.filePath ? '⏳' : '⚡ Gen'}
                                    </button>
                                )}
                            </div>
                        )
                    })}
                </div>
            )}
        </div>
    )
}

const TreeViewComponent = ({ tree, expandedNodes, onToggleNode, onExpandAll, onCollapseAll, onNavigateToFile, onGenerate, generatingFile, searchQuery, selectedPageId }: {
    tree: TreeNode[]
    expandedNodes: Set<string>
    onToggleNode: (path: string) => void
    onExpandAll: () => void
    onCollapseAll: () => void
    onNavigateToFile: (pageId: string) => void
    onGenerate: (filePath: string) => void
    generatingFile: string | null
    searchQuery: string
    selectedPageId: string | null
}) => {
    return (
        <div className="tree-view-container">
            <div className="tree-view-header">
                <span className="tree-view-header-title">Explorer</span>
                <div className="tree-view-header-actions">
                    <button className="tree-view-action-btn" onClick={onExpandAll} title="Expand All">
                        <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><path d="M1 4l3-3 3 3H1zm0 8l3 3 3-3H1zm8-8l3-3 3 3H9zm0 8l3 3 3-3H9z" /></svg>
                    </button>
                    <button className="tree-view-action-btn" onClick={onCollapseAll} title="Collapse All">
                        <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><path d="M1 4l3 3 3-3H1zm8 0l3 3 3-3H9z" /></svg>
                    </button>
                </div>
            </div>
            <div className="tree-view-body">
                {tree.map(node => (
                    <FileTreeNode key={node.fullPath} node={node} depth={0} expandedNodes={expandedNodes}
                        onToggleNode={onToggleNode} onNavigateToFile={onNavigateToFile}
                        onGenerate={onGenerate} generatingFile={generatingFile} searchQuery={searchQuery} selectedPageId={selectedPageId} />
                ))}
            </div>
        </div>
    )
}

// Keep FolderCard signature but it's now unused - replaced by TreeViewComponent
const FolderCard = ({ folderName, pages, onNavigateToFile, isExpanded, onToggle, onGenerate, generatingFile }: {
    folderName: string
    pages: Page[]
    onNavigateToFile: (pageId: string) => void
    isExpanded: boolean
    onToggle: () => void
    onGenerate: (filePath: string) => void
    generatingFile: string | null
}) => {
    const totalLines = pages.reduce((sum, p) => sum + p.totalLines, 0)
    const totalSections = pages.reduce((sum, p) => sum + p.sections.length, 0)
    const totalPrompts = pages.reduce((sum, p) => sum + p.sections.reduce((s, sec) => s + sec.prompts.length, 0), 0)

    // Get display name - skip dynamic route segments like [id], [slug], [...params]
    const getDisplayName = (path: string) => {
        const parts = path.split('/').filter(Boolean)
        // Find the last non-dynamic segment (doesn't start with '[')
        for (let i = parts.length - 1; i >= 0; i--) {
            if (!parts[i].startsWith('[')) {
                return parts[i]
            }
        }
        // Fallback to last segment if all are dynamic
        return parts[parts.length - 1] || path
    }

    return (
        <div className={`glass-card rounded-xl sm:rounded-2xl overflow-hidden transition-all duration-300 ${isExpanded ? 'ring-2 ring-indigo-500/50' : 'hover:ring-1 hover:ring-white/20'}`}>
            {/* Folder Header - Clickable */}
            <button
                onClick={onToggle}
                className="w-full p-4 sm:p-6 lg:p-8 text-left bg-gradient-to-br from-slate-100/50 dark:from-slate-800/50 to-slate-200/50 dark:to-slate-900/50 hover:from-slate-700/50 hover:to-slate-800/50 active:from-slate-700/60 active:to-slate-800/60 transition-all"
            >
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                    <div className="flex items-center gap-3 sm:gap-5">
                        <div className="w-12 h-12 sm:w-14 lg:w-16 sm:h-14 lg:h-16 rounded-xl sm:rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shadow-lg shadow-indigo-500/20 flex-shrink-0">
                            <span className="text-xl sm:text-2xl lg:text-3xl">{isExpanded ? '📂' : '📁'}</span>
                        </div>
                        <div className="min-w-0">
                            <h2 className="text-lg sm:text-xl lg:text-2xl font-bold text-slate-900 dark:text-white mb-0.5 sm:mb-1 truncate">{getDisplayName(folderName)}</h2>
                            <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 font-mono truncate">{folderName}</p>
                        </div>
                    </div>

                    <div className="flex items-center justify-between sm:justify-end gap-3 sm:gap-4">
                        {/* Stats - Fixed alignment with min-width */}
                        <div className="flex gap-4 sm:gap-6">
                            <div className="min-w-[40px] sm:min-w-[60px] text-center">
                                <div className="text-base sm:text-lg lg:text-xl font-bold text-indigo-600 dark:text-indigo-400">{pages.length}</div>
                                <div className="text-[10px] sm:text-xs text-slate-400 dark:text-slate-500 uppercase tracking-wide">Files</div>
                            </div>
                            <div className="min-w-[50px] sm:min-w-[70px] text-center">
                                <div className="text-base sm:text-lg lg:text-xl font-bold text-emerald-600 dark:text-emerald-400">{totalLines.toLocaleString()}</div>
                                <div className="text-[10px] sm:text-xs text-slate-400 dark:text-slate-500 uppercase tracking-wide">LOC</div>
                            </div>
                            <div className="hidden xs:block min-w-[50px] sm:min-w-[70px] text-center">
                                <div className="text-base sm:text-lg lg:text-xl font-bold text-amber-600 dark:text-amber-400">{totalSections}</div>
                                <div className="text-[10px] sm:text-xs text-slate-400 dark:text-slate-500 uppercase tracking-wide">Sections</div>
                            </div>
                            <div className="hidden sm:block min-w-[70px] text-center">
                                <div className="text-xl font-bold text-pink-600 dark:text-pink-400">{totalPrompts}</div>
                                <div className="text-xs text-slate-400 dark:text-slate-500 uppercase tracking-wide">Prompts</div>
                            </div>
                        </div>

                        {/* Toggle Icon */}
                        <div className={`text-lg sm:text-xl lg:text-2xl text-slate-500 dark:text-slate-400 transition-transform duration-300 ml-1 sm:ml-2 ${isExpanded ? 'rotate-180' : ''}`}>
                            ▼
                        </div>
                    </div>
                </div>
            </button>


            {/* Files List - Expandable */}
            {isExpanded && (
                <div className="border-t border-slate-200 dark:border-white/10 bg-slate-200/50 dark:bg-black/30">
                    <div className="p-2 sm:p-4 space-y-1 sm:space-y-2">
                        {pages.map((page) => (
                            <button
                                key={page.id}
                                onClick={() => onNavigateToFile(page.id)}
                                className="w-full flex items-center justify-between p-3 sm:p-4 rounded-lg sm:rounded-xl bg-white/50 dark:bg-slate-900/50 hover:bg-slate-100/70 dark:bg-slate-800/70 active:bg-slate-100 dark:bg-slate-800/90 border border-slate-200 dark:border-white/5 hover:border-indigo-500/30 transition-all group"
                            >
                                <div className="flex items-center gap-2 sm:gap-4 min-w-0">
                                    <span className="text-lg sm:text-xl flex-shrink-0">📄</span>
                                    <div className="text-left min-w-0">
                                        <div className="font-semibold text-sm sm:text-base text-slate-900 dark:text-white group-hover:text-indigo-700 dark:text-indigo-300 transition-colors truncate">
                                            {page.componentName}
                                        </div>
                                        <div className="text-[10px] sm:text-xs text-slate-400 dark:text-slate-500 font-mono truncate">
                                            {page.filePath.split('/').pop()}
                                        </div>
                                    </div>
                                </div>
                                <div className="flex items-center gap-2 sm:gap-4 flex-shrink-0">
                                    {page.sections.length === 0 && !page.promptFilePath && (
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation()
                                                onGenerate(page.filePath)
                                            }}
                                            disabled={generatingFile === page.filePath}
                                            className={`px-2 sm:px-3 py-1 sm:py-1.5 rounded-lg text-[10px] sm:text-xs font-semibold transition-all border ${generatingFile === page.filePath
                                                ? 'bg-amber-500/20 text-amber-600 dark:text-amber-300 border-amber-500/30 cursor-wait animate-pulse'
                                                : 'bg-gradient-to-r from-emerald-500/20 to-teal-500/20 text-emerald-700 dark:text-emerald-300 border-emerald-500/30 hover:from-emerald-500/30 hover:to-teal-500/30 active:scale-95'
                                                }`}
                                            title="Generate NLP & Developer prompts from code"
                                        >
                                            {generatingFile === page.filePath ? '⏳ Generating...' : '🧠 Generate'}
                                        </button>
                                    )}
                                    <div className="min-w-[35px] sm:min-w-[50px] text-center">
                                        <div className="text-xs sm:text-sm font-bold text-indigo-600 dark:text-indigo-400">{page.totalLines}</div>
                                        <div className="text-[9px] sm:text-[10px] text-slate-400 dark:text-slate-500 uppercase">LOC</div>
                                    </div>
                                    <div className="hidden xs:block min-w-[45px] sm:min-w-[55px] text-center">
                                        <div className="text-xs sm:text-sm font-bold text-emerald-600 dark:text-emerald-400">{page.sections.length}</div>
                                        <div className="text-[9px] sm:text-[10px] text-slate-400 dark:text-slate-500 uppercase">Sections</div>
                                    </div>
                                    <div className="hidden sm:block min-w-[55px] text-center">
                                        <div className="text-sm font-bold text-pink-600 dark:text-pink-400">{page.sections.reduce((s, sec) => s + sec.prompts.length, 0)}</div>
                                        <div className="text-[10px] text-slate-400 dark:text-slate-500 uppercase">Prompts</div>
                                    </div>
                                    <span className="text-slate-400 dark:text-slate-500 group-hover:text-indigo-600 dark:text-indigo-400 transition-colors ml-1 sm:ml-2">→</span>
                                </div>
                            </button>
                        ))}
                    </div>
                </div>
            )}
        </div>
    )
}

// File Detail Modal/View
const FileDetailView = ({ page, masterPrompt, onClose, onSave }: {
    page: Page
    masterPrompt?: MasterPrompt
    onClose: () => void
    onSave: (pageId: string, content: string) => Promise<void>
}) => {
    const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set())
    const [isEditing, setIsEditing] = useState(false)
    const [searchQuery, setSearchQuery] = useState('')

    const toggleSection = (id: string) => {
        const next = new Set(expandedSections)
        if (next.has(id)) next.delete(id)
        else next.add(id)
        setExpandedSections(next)
    }

    const filteredSections = searchQuery
        ? page.sections.filter(s =>
            s.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
            s.purpose.toLowerCase().includes(searchQuery.toLowerCase()) ||
            s.prompts.some(p => p.template.toLowerCase().includes(searchQuery.toLowerCase()))
        )
        : page.sections

    const scrollToLine = (line: number) => {
        if (!page.rawContent) return

        const lines = page.rawContent.split('\n')
        if (line < 1) line = 1
        if (line > lines.length) line = lines.length

        const pos = lines.slice(0, line - 1).join('\n').length

        setIsEditing(true)

        setTimeout(() => {
            const textarea = document.getElementById(`editor-${page.id}`) as HTMLTextAreaElement
            if (textarea) {
                textarea.focus()
                textarea.setSelectionRange(pos, pos + lines[line - 1].length)
                const lineHeight = 16
                textarea.scrollTop = (line - 1) * lineHeight - (textarea.clientHeight / 2)
            }
        }, 100)
    }

    const downloadFile = () => {
        if (!page.rawContent) return
        const element = document.createElement("a")
        const file = new Blob([page.rawContent], { type: 'text/plain' })
        element.href = URL.createObjectURL(file)
        element.download = page.componentName + ".txt"
        document.body.appendChild(element)
        element.click()
        document.body.removeChild(element)
    }

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-black/70 backdrop-blur-sm overflow-y-auto">
            <div className="w-full max-w-6xl max-h-[95vh] sm:max-h-[90vh] overflow-hidden rounded-2xl sm:rounded-3xl glass-card border border-slate-200 dark:border-white/10 flex flex-col my-2 sm:my-4">
                {/* Header */}
                <div className="p-4 sm:p-6 border-b border-slate-200 dark:border-white/10 bg-gradient-to-r from-slate-100/50 dark:from-slate-800/50 to-slate-200/50 dark:to-slate-900/50">
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4">
                        <div className="flex items-center gap-3 sm:gap-4 min-w-0">
                            <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-lg sm:rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center flex-shrink-0">
                                <span className="text-xl sm:text-2xl">📄</span>
                            </div>
                            <div className="min-w-0">
                                <h2 className="text-lg sm:text-xl lg:text-2xl font-bold text-slate-900 dark:text-white truncate">{page.componentName}</h2>
                                <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 font-mono truncate">{page.filePath}</p>
                            </div>
                        </div>
                        <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
                            {/* Stats */}
                            <div className="flex gap-3 sm:gap-4 mr-2 sm:mr-4">
                                <div className="text-center">
                                    <div className="text-base sm:text-lg lg:text-xl font-bold text-indigo-600 dark:text-indigo-400">{page.totalLines}</div>
                                    <div className="text-[9px] sm:text-[10px] text-slate-400 dark:text-slate-500 uppercase">Lines</div>
                                </div>
                                <div className="text-center">
                                    <div className="text-base sm:text-lg lg:text-xl font-bold text-emerald-600 dark:text-emerald-400">{page.sections.length}</div>
                                    <div className="text-[9px] sm:text-[10px] text-slate-400 dark:text-slate-500 uppercase">Sections</div>
                                </div>
                            </div>
                            {page.rawContent && (
                                <>
                                    <button
                                        onClick={downloadFile}
                                        className="px-2 sm:px-3 py-1.5 sm:py-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-700 text-[10px] sm:text-xs rounded-lg border border-slate-300 dark:border-slate-600 transition-colors"
                                    >
                                        <span className="hidden xs:inline">⬇️ </span>Download
                                    </button>
                                    <button
                                        onClick={() => setIsEditing(!isEditing)}
                                        className={`px-2 sm:px-3 py-1.5 sm:py-2 text-[10px] sm:text-xs rounded-lg border transition-colors ${isEditing ? 'bg-indigo-600 border-indigo-500' : 'bg-slate-100 dark:bg-slate-800 hover:bg-slate-700 border-slate-300 dark:border-slate-600'}`}
                                    >
                                        ✏️ <span className="hidden xs:inline">{isEditing ? 'Editing' : 'Edit'}</span>
                                    </button>
                                </>
                            )}
                            <button
                                onClick={onClose}
                                className="w-8 h-8 sm:w-10 sm:h-10 flex items-center justify-center rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-red-500/20 hover:text-red-600 dark:text-red-400 transition-colors text-lg sm:text-xl"
                            >
                                ×
                            </button>
                        </div>
                    </div>

                    {/* Purpose */}
                    <p className="mt-3 sm:mt-4 text-sm sm:text-base text-slate-700 dark:text-slate-300 line-clamp-2">{page.purpose}</p>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-auto p-3 sm:p-4 lg:p-6 space-y-3 sm:space-y-4">
                    {/* Editor */}
                    {isEditing && page.rawContent && (
                        <div className="p-3 sm:p-4 bg-slate-200/80 dark:bg-black/50 border border-slate-200 dark:border-slate-700 rounded-lg sm:rounded-xl">
                            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 mb-2">
                                <span className="text-[10px] sm:text-xs text-slate-500 dark:text-slate-400 font-mono truncate">Editing {page.componentName}.txt</span>
                                <button
                                    onClick={async () => {
                                        const textarea = document.getElementById(`editor-${page.id}`) as HTMLTextAreaElement
                                        if (!textarea) return
                                        await onSave(page.id, textarea.value)
                                        setIsEditing(false)
                                    }}
                                    className="px-2 sm:px-3 py-1 bg-green-600 hover:bg-green-500 text-[10px] sm:text-xs rounded font-bold shadow-lg shadow-green-500/20 active:scale-95 transition-all"
                                >
                                    💾 Save & Reprocess
                                </button>
                            </div>
                            <textarea
                                id={`editor-${page.id}`}
                                className="w-full h-[250px] sm:h-[350px] lg:h-[400px] bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 font-mono text-[10px] sm:text-xs p-3 sm:p-4 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/50 resize-y"
                                defaultValue={page.rawContent}
                            />
                        </div>
                    )}

                    {/* Search */}
                    <div className="relative">
                        <input
                            type="text"
                            placeholder="Search sections and prompts..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="w-full bg-white/50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700/50 rounded-lg sm:rounded-xl px-3 sm:px-4 py-2.5 sm:py-3 pl-8 sm:pl-10 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 text-xs sm:text-sm"
                        />
                        <span className="absolute left-2.5 sm:left-3 top-2.5 sm:top-3.5 text-slate-400 dark:text-slate-500 text-sm">🔍</span>
                    </div>

                    {/* Sections - Grouped by NLP and Developer */}
                    {filteredSections.length > 0 ? (
                        <div className="space-y-4 sm:space-y-6">
                            {/* Group sections by type based on name */}
                            {(() => {
                                const nlpSections = filteredSections.filter(s =>
                                    s.name.toUpperCase().includes('NLP') ||
                                    s.name.toUpperCase().includes('USER-DEFINED') ||
                                    s.name.toUpperCase().includes('USER DEFINED')
                                )
                                const devSections = filteredSections.filter(s =>
                                    s.name.toUpperCase().includes('DEVELOPER') ||
                                    s.name.toUpperCase().includes('DEV ') ||
                                    s.name.toUpperCase().includes('TECHNICAL')
                                )
                                const otherSections = filteredSections.filter(s =>
                                    !nlpSections.includes(s) && !devSections.includes(s)
                                )

                                return (
                                    <>
                                        {/* NLP Sections Group */}
                                        {nlpSections.length > 0 && (
                                            <div className="glass-panel rounded-xl sm:rounded-2xl overflow-hidden border-2 border-emerald-500/30">
                                                {/* NLP Main Header */}
                                                <div className="p-4 sm:p-5 bg-gradient-to-r from-emerald-900/40 to-emerald-800/20 border-b border-emerald-500/20">
                                                    <div className="flex items-center gap-3">
                                                        <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl bg-gradient-to-br from-emerald-500 to-green-600 flex items-center justify-center shadow-lg shadow-emerald-500/30">
                                                            <span className="text-xl sm:text-2xl">💬</span>
                                                        </div>
                                                        <div>
                                                            <h3 className="text-lg sm:text-xl font-bold text-emerald-700 dark:text-emerald-300">NLP Prompts</h3>
                                                            <p className="text-xs sm:text-sm text-emerald-600 dark:text-emerald-400/70">User-friendly • Easy to Understand & Modify</p>
                                                        </div>
                                                        <div className="ml-auto text-right">
                                                            <div className="text-lg sm:text-xl font-bold text-emerald-600 dark:text-emerald-400">{nlpSections.reduce((sum, s) => sum + s.prompts.length, 0)}</div>
                                                            <div className="text-[10px] sm:text-xs text-slate-400 dark:text-slate-500 uppercase">Prompts</div>
                                                        </div>
                                                    </div>
                                                </div>

                                                {/* NLP Sections Content */}
                                                <div className="p-3 sm:p-4 space-y-3 sm:space-y-4 bg-emerald-950/20">
                                                    {nlpSections.map(section => {
                                                        const isExpanded = expandedSections.has(section.id) || !!searchQuery
                                                        return (
                                                            <div key={section.id} className="bg-slate-200/50 dark:bg-black/30 rounded-lg sm:rounded-xl border border-emerald-500/10 overflow-hidden">
                                                                <button
                                                                    onClick={() => toggleSection(section.id)}
                                                                    className="w-full flex items-center justify-between p-3 sm:p-4 hover:bg-emerald-900/20 transition-colors text-left"
                                                                >
                                                                    <div className="flex items-center gap-2 sm:gap-3 min-w-0">
                                                                        <Badge color="green">{section.name}</Badge>
                                                                        <span className="text-[10px] sm:text-xs font-mono text-slate-400 dark:text-slate-500 hidden xs:inline">L{section.startLine}-{section.endLine}</span>
                                                                    </div>
                                                                    <div className="flex items-center gap-2">
                                                                        <span className="text-xs text-emerald-600 dark:text-emerald-400">{section.prompts.length} prompts</span>
                                                                        <span className={`text-emerald-600 dark:text-emerald-400 transition-transform duration-300 ${isExpanded ? 'rotate-180' : ''}`}>▼</span>
                                                                    </div>
                                                                </button>

                                                                {isExpanded && section.prompts.length > 0 && (
                                                                    <div className="p-3 sm:p-4 border-t border-emerald-500/10 space-y-2 sm:space-y-3">
                                                                        {section.purpose && section.purpose !== 'Section Purpose' && (
                                                                            <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 italic border-l-2 border-emerald-500/50 pl-2 sm:pl-3 mb-3">
                                                                                {section.purpose}
                                                                            </p>
                                                                        )}
                                                                        {section.prompts.map(prompt => (
                                                                            <div key={prompt.id} className="group relative bg-emerald-950/40 rounded-lg p-3 sm:p-4 border border-emerald-500/10 hover:border-emerald-500/40 transition-all">
                                                                                <div className="absolute right-2 top-2 flex items-center gap-1 sm:gap-2 sm:opacity-0 group-hover:opacity-100 transition-opacity">
                                                                                    <button
                                                                                        onClick={(e) => {
                                                                                            e.stopPropagation()
                                                                                            scrollToLine(prompt.lineNumber || 1)
                                                                                        }}
                                                                                        className="text-[10px] sm:text-xs px-1.5 sm:px-2 py-0.5 sm:py-1 rounded bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-500/40 border border-emerald-500/30 transition-colors"
                                                                                        title="Edit this prompt"
                                                                                    >
                                                                                        ✏️
                                                                                    </button>
                                                                                    <CopyButton text={prompt.template} />
                                                                                </div>
                                                                                <div className="pr-16 sm:pr-20">
                                                                                    <span className="text-[9px] sm:text-[10px] uppercase font-bold text-emerald-500/60 tracking-wider">Line {prompt.lineNumber}</span>
                                                                                    <div className="font-mono text-xs sm:text-sm text-emerald-200 mt-1 break-words leading-relaxed">{prompt.template}</div>
                                                                                </div>
                                                                                {prompt.example && (
                                                                                    <div className="mt-2 pl-2 sm:pl-3 border-l-2 border-emerald-700/50">
                                                                                        <span className="text-[9px] sm:text-[10px] uppercase font-bold text-slate-600 tracking-wider">Example</span>
                                                                                        <div className="text-[10px] sm:text-xs text-slate-500 dark:text-slate-400 mt-0.5">{prompt.example}</div>
                                                                                    </div>
                                                                                )}
                                                                            </div>
                                                                        ))}
                                                                    </div>
                                                                )}
                                                            </div>
                                                        )
                                                    })}
                                                </div>
                                            </div>
                                        )}

                                        {/* Developer Sections Group */}
                                        {devSections.length > 0 && (
                                            <div className="glass-panel rounded-xl sm:rounded-2xl overflow-hidden border-2 border-purple-500/30">
                                                {/* Developer Main Header */}
                                                <div className="p-4 sm:p-5 bg-gradient-to-r from-purple-900/40 to-purple-800/20 border-b border-purple-500/20">
                                                    <div className="flex items-center gap-3">
                                                        <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl bg-gradient-to-br from-purple-500 to-violet-600 flex items-center justify-center shadow-lg shadow-purple-500/30">
                                                            <span className="text-xl sm:text-2xl">⚙️</span>
                                                        </div>
                                                        <div>
                                                            <h3 className="text-lg sm:text-xl font-bold text-purple-700 dark:text-purple-300">Developer Prompts</h3>
                                                            <p className="text-xs sm:text-sm text-purple-600 dark:text-purple-400/70">Technical & Precise • Code-focused</p>
                                                        </div>
                                                        <div className="ml-auto text-right">
                                                            <div className="text-lg sm:text-xl font-bold text-purple-600 dark:text-purple-400">{devSections.reduce((sum, s) => sum + s.prompts.length, 0)}</div>
                                                            <div className="text-[10px] sm:text-xs text-slate-400 dark:text-slate-500 uppercase">Prompts</div>
                                                        </div>
                                                    </div>
                                                </div>

                                                {/* Developer Sections Content */}
                                                <div className="p-3 sm:p-4 space-y-3 sm:space-y-4 bg-purple-950/20">
                                                    {devSections.map(section => {
                                                        const isExpanded = expandedSections.has(section.id) || !!searchQuery
                                                        return (
                                                            <div key={section.id} className="bg-slate-200/50 dark:bg-black/30 rounded-lg sm:rounded-xl border border-purple-500/10 overflow-hidden">
                                                                <button
                                                                    onClick={() => toggleSection(section.id)}
                                                                    className="w-full flex items-center justify-between p-3 sm:p-4 hover:bg-purple-900/20 transition-colors text-left"
                                                                >
                                                                    <div className="flex items-center gap-2 sm:gap-3 min-w-0">
                                                                        <Badge color="purple">{section.name}</Badge>
                                                                        <span className="text-[10px] sm:text-xs font-mono text-slate-400 dark:text-slate-500 hidden xs:inline">L{section.startLine}-{section.endLine}</span>
                                                                    </div>
                                                                    <div className="flex items-center gap-2">
                                                                        <span className="text-xs text-purple-600 dark:text-purple-400">{section.prompts.length} prompts</span>
                                                                        <span className={`text-purple-600 dark:text-purple-400 transition-transform duration-300 ${isExpanded ? 'rotate-180' : ''}`}>▼</span>
                                                                    </div>
                                                                </button>

                                                                {isExpanded && section.prompts.length > 0 && (
                                                                    <div className="p-3 sm:p-4 border-t border-purple-500/10 space-y-2 sm:space-y-3">
                                                                        {section.purpose && section.purpose !== 'Section Purpose' && (
                                                                            <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 italic border-l-2 border-purple-500/50 pl-2 sm:pl-3 mb-3">
                                                                                {section.purpose}
                                                                            </p>
                                                                        )}
                                                                        {section.prompts.map(prompt => (
                                                                            <div key={prompt.id} className="group relative bg-purple-950/40 rounded-lg p-3 sm:p-4 border border-purple-500/10 hover:border-purple-500/40 transition-all">
                                                                                <div className="absolute right-2 top-2 flex items-center gap-1 sm:gap-2 sm:opacity-0 group-hover:opacity-100 transition-opacity">
                                                                                    <button
                                                                                        onClick={(e) => {
                                                                                            e.stopPropagation()
                                                                                            scrollToLine(prompt.lineNumber || 1)
                                                                                        }}
                                                                                        className="text-[10px] sm:text-xs px-1.5 sm:px-2 py-0.5 sm:py-1 rounded bg-purple-500/20 text-purple-700 dark:text-purple-300 hover:bg-purple-500/40 border border-purple-500/30 transition-colors"
                                                                                        title="Edit this prompt"
                                                                                    >
                                                                                        ✏️
                                                                                    </button>
                                                                                    <CopyButton text={prompt.template} />
                                                                                </div>
                                                                                <div className="pr-16 sm:pr-20">
                                                                                    <span className="text-[9px] sm:text-[10px] uppercase font-bold text-purple-500/60 tracking-wider">Line {prompt.lineNumber}</span>
                                                                                    <div className="font-mono text-xs sm:text-sm text-purple-200 mt-1 break-words leading-relaxed">{prompt.template}</div>
                                                                                </div>
                                                                                {prompt.example && (
                                                                                    <div className="mt-2 pl-2 sm:pl-3 border-l-2 border-purple-700/50">
                                                                                        <span className="text-[9px] sm:text-[10px] uppercase font-bold text-slate-600 tracking-wider">Example</span>
                                                                                        <div className="text-[10px] sm:text-xs text-slate-500 dark:text-slate-400 mt-0.5">{prompt.example}</div>
                                                                                    </div>
                                                                                )}
                                                                            </div>
                                                                        ))}
                                                                    </div>
                                                                )}
                                                            </div>
                                                        )
                                                    })}
                                                </div>
                                            </div>
                                        )}

                                        {/* Other Sections (not matching NLP or Developer) */}
                                        {otherSections.length > 0 && (
                                            <div className="glass-panel rounded-xl sm:rounded-2xl overflow-hidden border border-slate-200 dark:border-white/10">
                                                <div className="p-4 sm:p-5 bg-gradient-to-r from-slate-100 dark:from-slate-800/40 to-slate-700/20 border-b border-slate-200 dark:border-white/10">
                                                    <div className="flex items-center gap-3">
                                                        <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl bg-gradient-to-br from-slate-500 to-slate-600 flex items-center justify-center shadow-lg shadow-slate-500/30">
                                                            <span className="text-xl sm:text-2xl">📋</span>
                                                        </div>
                                                        <div>
                                                            <h3 className="text-lg sm:text-xl font-bold text-slate-700 dark:text-slate-300">Other Sections</h3>
                                                            <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400/70">Additional prompts & content</p>
                                                        </div>
                                                        <div className="ml-auto text-right">
                                                            <div className="text-lg sm:text-xl font-bold text-slate-500 dark:text-slate-400">{otherSections.reduce((sum, s) => sum + s.prompts.length, 0)}</div>
                                                            <div className="text-[10px] sm:text-xs text-slate-400 dark:text-slate-500 uppercase">Prompts</div>
                                                        </div>
                                                    </div>
                                                </div>

                                                <div className="p-3 sm:p-4 space-y-3 sm:space-y-4">
                                                    {otherSections.map(section => {
                                                        const isExpanded = expandedSections.has(section.id) || !!searchQuery
                                                        return (
                                                            <div key={section.id} className="bg-slate-200/50 dark:bg-black/30 rounded-lg sm:rounded-xl border border-slate-200 dark:border-white/5 overflow-hidden">
                                                                <button
                                                                    onClick={() => toggleSection(section.id)}
                                                                    className="w-full flex items-center justify-between p-3 sm:p-4 hover:bg-slate-200 dark:bg-white/5 transition-colors text-left"
                                                                >
                                                                    <div className="flex items-center gap-2 sm:gap-3 min-w-0">
                                                                        <Badge color="blue">{section.name}</Badge>
                                                                        <span className="text-[10px] sm:text-xs font-mono text-slate-400 dark:text-slate-500 hidden xs:inline">L{section.startLine}-{section.endLine}</span>
                                                                    </div>
                                                                    <div className="flex items-center gap-2">
                                                                        <span className="text-xs text-slate-500 dark:text-slate-400">{section.prompts.length} prompts</span>
                                                                        <span className={`text-slate-500 dark:text-slate-400 transition-transform duration-300 ${isExpanded ? 'rotate-180' : ''}`}>▼</span>
                                                                    </div>
                                                                </button>

                                                                {isExpanded && section.prompts.length > 0 && (
                                                                    <div className="p-3 sm:p-4 border-t border-slate-200 dark:border-white/5 space-y-2 sm:space-y-3">
                                                                        {section.purpose && section.purpose !== 'Section Purpose' && (
                                                                            <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 italic border-l-2 border-indigo-500/50 pl-2 sm:pl-3 mb-3">
                                                                                {section.purpose}
                                                                            </p>
                                                                        )}
                                                                        {section.prompts.map(prompt => (
                                                                            <div key={prompt.id} className="group relative bg-white/50 dark:bg-slate-900/50 rounded-lg p-3 sm:p-4 border border-slate-200 dark:border-white/5 hover:border-indigo-500/40 transition-all">
                                                                                <div className="absolute right-2 top-2 flex items-center gap-1 sm:gap-2 sm:opacity-0 group-hover:opacity-100 transition-opacity">
                                                                                    <button
                                                                                        onClick={(e) => {
                                                                                            e.stopPropagation()
                                                                                            scrollToLine(prompt.lineNumber || 1)
                                                                                        }}
                                                                                        className="text-[10px] sm:text-xs px-1.5 sm:px-2 py-0.5 sm:py-1 rounded bg-indigo-500/20 text-indigo-700 dark:text-indigo-300 hover:bg-indigo-500/40 border border-indigo-500/30 transition-colors"
                                                                                        title="Edit this prompt"
                                                                                    >
                                                                                        ✏️
                                                                                    </button>
                                                                                    <CopyButton text={prompt.template} />
                                                                                </div>
                                                                                <div className="pr-16 sm:pr-20">
                                                                                    <span className="text-[9px] sm:text-[10px] uppercase font-bold text-slate-400 dark:text-slate-500/60 tracking-wider">Line {prompt.lineNumber}</span>
                                                                                    <div className="font-mono text-xs sm:text-sm text-slate-800 dark:text-slate-200 mt-1 break-words leading-relaxed">{prompt.template}</div>
                                                                                </div>
                                                                                {prompt.example && (
                                                                                    <div className="mt-2 pl-2 sm:pl-3 border-l-2 border-slate-200 dark:border-slate-700">
                                                                                        <span className="text-[9px] sm:text-[10px] uppercase font-bold text-slate-600 tracking-wider">Example</span>
                                                                                        <div className="text-[10px] sm:text-xs text-slate-500 dark:text-slate-400 mt-0.5">{prompt.example}</div>
                                                                                    </div>
                                                                                )}
                                                                            </div>
                                                                        ))}
                                                                    </div>
                                                                )}
                                                            </div>
                                                        )
                                                    })}
                                                </div>
                                            </div>
                                        )}
                                    </>
                                )
                            })()}
                        </div>
                    ) : (
                        <div className="glass-panel rounded-lg sm:rounded-xl p-8 sm:p-12 text-center text-slate-500 dark:text-slate-400">
                            <p className="text-sm sm:text-base">No sections found. Click "Edit" to add sections.</p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    )
}

export default function Home() {
    const router = useRouter()
    const [pages, setPages] = useState<Page[]>([])
    const [masterPrompts, setMasterPrompts] = useState<MasterPrompt[]>([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [seeding, setSeeding] = useState(false)
    const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set())
    const [searchQuery, setSearchQuery] = useState('')
    const [generatingFile, setGeneratingFile] = useState<string | null>(null)
    const [selectedPageId, setSelectedPageId] = useState<string | null>(null)
    const [openTabs, setOpenTabs] = useState<string[]>([])

    useEffect(() => {
        // Check auth before fetching
        const token = getAccessToken()
        if (!token) {
            router.push('/login')
            return
        }
        fetchData()
    }, [])

    const fetchData = async () => {
        setLoading(true)
        setError(null)
        try {
            const result = await apiRequest<{ pages: Page[], masterPrompts: MasterPrompt[] }>('/api/pages')

            if (result.status === 401) {
                clearAuthData()
                router.push('/login')
                return
            }

            if (result.success && result.data) {
                setPages(result.data.pages || [])
                setMasterPrompts(result.data.masterPrompts || [])
            } else {
                throw new Error(result.error || 'Failed to fetch data')
            }
        } catch (err) {
            console.error('Fetch error:', err)
            setError('Could not load data. Ensure the backend server is running.')
        } finally {
            setLoading(false)
        }
    }

    const handleSeed = async () => {
        setSeeding(true)
        setError(null)
        try {
            const result = await apiRequest('/api/seed', { method: 'POST' })

            if (result.status === 401) {
                clearAuthData()
                router.push('/login')
                return
            }

            if (result.success && result.data?.success) {
                await fetchData()
            } else {
                throw new Error(result.error || result.data?.error || 'Seeding failed')
            }
        } catch (err) {
            console.error('Seed error:', err)
            setError(err instanceof Error ? err.message : 'Failed to seed database')
        } finally {
            setSeeding(false)
        }
    }

    const toggleNode = (path: string) => {
        const next = new Set(expandedNodes)
        if (next.has(path)) next.delete(path)
        else next.add(path)
        setExpandedNodes(next)
    }

    const expandAllNodes = () => {
        const tree = buildTree(groupedPages)
        const allPaths = getAllPaths(tree)
        setExpandedNodes(new Set(allPaths))
    }

    const collapseAllNodes = () => {
        setExpandedNodes(new Set())
    }

    // Select a file to show in the editor panel
    const selectFile = (pageId: string) => {
        setSelectedPageId(pageId)
        if (!openTabs.includes(pageId)) {
            setOpenTabs(prev => [...prev, pageId])
        }
    }

    const closeTab = (pageId: string) => {
        const newTabs = openTabs.filter(id => id !== pageId)
        setOpenTabs(newTabs)
        if (selectedPageId === pageId) {
            setSelectedPageId(newTabs.length > 0 ? newTabs[newTabs.length - 1] : null)
        }
    }

    const selectedPage = pages.find(p => p.id === selectedPageId) || null

    // Generate prompts for a code-only file
    const handleGenerate = async (filePath: string) => {
        setGeneratingFile(filePath)
        setError(null)
        try {
            const result = await apiRequest('/api/generate-prompts', {
                method: 'POST',
                body: { filePath },
                requiresAuth: false
            })

            if (result.success && result.data?.success) {
                // Refresh data after generation + seed completed
                await fetchData()
            } else {
                throw new Error(result.error || result.data?.error || 'Generation failed')
            }
        } catch (err) {
            console.error('Generate error:', err)
            setError(err instanceof Error ? err.message : 'Failed to generate prompts')
        } finally {
            setGeneratingFile(null)
        }
    }

    // Group pages by folder
    const groupedPages = pages.reduce((groups, page) => {
        const folder = page.filePath.substring(0, page.filePath.lastIndexOf('/')) || 'Root'
        if (!groups[folder]) groups[folder] = []
        groups[folder].push(page)
        return groups
    }, {} as Record<string, Page[]>)

    // Build the tree structure from grouped pages
    const tree = buildTree(groupedPages)

    // Filter tree based on search (keep using filteredFolders length for conditional render)
    const filteredFolders = Object.entries(groupedPages).filter(([folderName, folderPages]) => {
        if (!searchQuery) return true
        const q = searchQuery.toLowerCase()
        return folderName.toLowerCase().includes(q) ||
            folderPages.some(p =>
                p.componentName.toLowerCase().includes(q) ||
                p.filePath.toLowerCase().includes(q)
            )
    })

    // Get file extension color for tabs
    const getFileColor = (filePath: string) => {
        const ext = filePath.split('.').pop()?.toLowerCase() || ''
        if (['tsx', 'jsx'].includes(ext)) return '#61dafb'
        if (ext === 'ts') return '#3178c6'
        if (ext === 'js') return '#f7df1e'
        if (ext === 'css') return '#563d7c'
        if (ext === 'json') return '#f5a623'
        return '#8b8b8b'
    }

    return (
        <div className="min-h-screen text-slate-800 dark:text-slate-200 p-2 sm:p-3 md:p-4 font-sans" style={{ maxWidth: '1440px', margin: '0 auto' }}>
            {/* Compact Header */}
            <header className="mb-2 sm:mb-3 flex items-center justify-between gap-3 px-2">
                <div className="flex items-center gap-3 min-w-0">
                    <button
                        onClick={() => router.push('/home')}
                        className="p-1.5 bg-slate-200 dark:bg-white/5 hover:bg-slate-300 dark:hover:bg-white/10 border border-slate-200 dark:border-white/10 rounded-lg transition-all flex-shrink-0"
                        title="Back to Projects"
                    >
                        <svg className="w-4 h-4 text-gray-500 dark:text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                        </svg>
                    </button>
                    <h1 className="text-lg sm:text-xl font-bold bg-gradient-to-r from-indigo-400 to-purple-400 bg-clip-text text-transparent truncate">
                        Agentic Prompt DB
                    </h1>
                </div>

                <div className="flex items-center gap-2 flex-shrink-0">
                    <button
                        onClick={handleSeed}
                        disabled={seeding}
                        className={`px-3 py-1.5 rounded-lg font-semibold text-xs transition-all flex items-center gap-1.5 ${seeding ? 'bg-slate-700 cursor-wait text-slate-400' : 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg shadow-indigo-600/20 active:scale-95'}`}
                    >
                        {seeding ? 'Syncing...' : '🔄 Sync'}
                    </button>
                    <ThemeToggle />
                </div>
            </header>

            {/* Error State */}
            {error && (
                <div className="mx-2 mb-2 bg-red-500/10 border border-red-500/20 rounded-lg p-3 flex items-center gap-3">
                    <span className="text-lg">⚠️</span>
                    <p className="text-xs text-red-600 dark:text-red-400 flex-1 truncate">{error}</p>
                    <button onClick={() => setError(null)} className="text-red-400 hover:text-red-300 text-sm">×</button>
                </div>
            )}

            {/* Loading State */}
            {loading && !pages.length && (
                <div className="flex justify-center py-20">
                    <div className="w-10 h-10 border-4 border-indigo-500/30 border-t-indigo-500 rounded-full animate-spin"></div>
                </div>
            )}

            {/* Empty State */}
            {!loading && !pages.length && !error && (
                <div className="text-center py-20 glass-panel rounded-2xl px-4">
                    <div className="text-5xl mb-6 opacity-50">📭</div>
                    <h2 className="text-2xl font-bold text-slate-700 dark:text-slate-300 mb-4">Database is Empty</h2>
                    <p className="text-sm text-slate-400 dark:text-slate-500 max-w-md mx-auto mb-8">
                        Click the seed button to import prompts from your codebase.
                    </p>
                    <button onClick={handleSeed} className="px-8 py-3 bg-indigo-600 hover:bg-indigo-500 rounded-xl font-bold text-sm shadow-lg shadow-indigo-500/25 transition-all">
                        Initialize Database
                    </button>
                </div>
            )}

            {/* VS Code IDE Layout */}
            {filteredFolders.length > 0 && (
                <div className="ide-layout">
                    {/* LEFT SIDEBAR - Tree Explorer */}
                    <div className="ide-sidebar">
                        {/* Search in sidebar */}
                        <div className="ide-sidebar-search">
                            <input
                                type="text"
                                placeholder="Search files..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                            />
                        </div>
                        <TreeViewComponent
                            tree={tree}
                            expandedNodes={expandedNodes}
                            onToggleNode={toggleNode}
                            onExpandAll={expandAllNodes}
                            onCollapseAll={collapseAllNodes}
                            onNavigateToFile={selectFile}
                            onGenerate={handleGenerate}
                            generatingFile={generatingFile}
                            searchQuery={searchQuery}
                            selectedPageId={selectedPageId}
                        />
                    </div>

                    {/* RIGHT - Editor Panel */}
                    <div className="ide-editor">
                        {/* Tab Bar */}
                        <div className="ide-tab-bar">
                            {openTabs.map(tabId => {
                                const tabPage = pages.find(p => p.id === tabId)
                                if (!tabPage) return null
                                return (
                                    <button
                                        key={tabId}
                                        className={`ide-tab ${selectedPageId === tabId ? 'active' : ''}`}
                                        onClick={() => setSelectedPageId(tabId)}
                                    >
                                        <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                                            <path d="M3 1h7l3 3v10.5a.5.5 0 01-.5.5h-9a.5.5 0 01-.5-.5v-13A.5.5 0 013 1z" fill={getFileColor(tabPage.filePath)} opacity="0.85" />
                                        </svg>
                                        {tabPage.componentName}
                                        <button
                                            className="ide-tab-close"
                                            onClick={(e) => { e.stopPropagation(); closeTab(tabId) }}
                                            title="Close"
                                        >×</button>
                                    </button>
                                )
                            })}
                        </div>

                        {/* Breadcrumb */}
                        {selectedPage && (
                            <div className="ide-breadcrumb">
                                {selectedPage.filePath.split('/').map((part, i, arr) => (
                                    <span key={i}>
                                        {i > 0 && <span className="separator"> › </span>}
                                        <span>{part}</span>
                                    </span>
                                ))}
                            </div>
                        )}

                        {/* Editor Content */}
                        {selectedPage ? (
                            <div className="ide-content">
                                {/* File Header */}
                                <div className="file-detail-header">
                                    <div className="file-icon">
                                        <svg viewBox="0 0 16 16" fill="none">
                                            <path d="M3 1h7l3 3v10.5a.5.5 0 01-.5.5h-9a.5.5 0 01-.5-.5v-13A.5.5 0 013 1z" fill={getFileColor(selectedPage.filePath)} opacity="0.85" />
                                            <path d="M10 1l3 3h-2.5a.5.5 0 01-.5-.5V1z" fill={getFileColor(selectedPage.filePath)} opacity="0.5" />
                                        </svg>
                                    </div>
                                    <div className="file-info">
                                        <h2>{selectedPage.componentName}</h2>
                                        <p>{selectedPage.filePath}</p>
                                    </div>
                                    <div className="file-detail-stats">
                                        <div className="file-detail-stat">
                                            <div className="value" style={{ color: '#61dafb' }}>{selectedPage.totalLines}</div>
                                            <div className="label">Lines</div>
                                        </div>
                                        <div className="file-detail-stat">
                                            <div className="value" style={{ color: '#73c991' }}>{selectedPage.sections.length}</div>
                                            <div className="label">Sections</div>
                                        </div>
                                        <div className="file-detail-stat">
                                            <div className="value" style={{ color: '#e2b93d' }}>{selectedPage.sections.reduce((s, sec) => s + sec.prompts.length, 0)}</div>
                                            <div className="label">Prompts</div>
                                        </div>
                                    </div>
                                </div>

                                {/* Purpose */}
                                {selectedPage.purpose && (
                                    <p style={{ fontSize: '13px', color: '#999', marginBottom: '20px', lineHeight: 1.5 }}>
                                        {selectedPage.purpose}
                                    </p>
                                )}

                                {/* Generate button for files without prompts */}
                                {!selectedPage.promptFilePath && selectedPage.sections.length === 0 && (
                                    <div style={{ padding: '16px', background: '#2d2d2d', borderRadius: '8px', marginBottom: '20px', textAlign: 'center' }}>
                                        <p style={{ fontSize: '13px', color: '#999', marginBottom: '12px' }}>No prompts found for this file.</p>
                                        <button
                                            onClick={() => handleGenerate(selectedPage.filePath)}
                                            disabled={generatingFile === selectedPage.filePath}
                                            className={`tree-gen-btn ${generatingFile === selectedPage.filePath ? 'busy' : ''}`}
                                            style={{ fontSize: '13px', padding: '6px 16px' }}
                                        >
                                            {generatingFile === selectedPage.filePath ? '⏳ Generating...' : '⚡ Generate Prompts'}
                                        </button>
                                    </div>
                                )}

                                {/* Sections */}
                                {selectedPage.sections.length > 0 && (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                                        {(() => {
                                            const nlpSections = selectedPage.sections.filter(s =>
                                                s.name.toUpperCase().includes('NLP') ||
                                                s.name.toUpperCase().includes('USER-DEFINED') ||
                                                s.name.toUpperCase().includes('USER DEFINED')
                                            )
                                            const devSections = selectedPage.sections.filter(s =>
                                                s.name.toUpperCase().includes('DEVELOPER') ||
                                                s.name.toUpperCase().includes('DEV ') ||
                                                s.name.toUpperCase().includes('TECHNICAL')
                                            )
                                            const otherSections = selectedPage.sections.filter(s =>
                                                !nlpSections.includes(s) && !devSections.includes(s)
                                            )

                                            const renderSectionGroup = (title: string, emoji: string, accent: string, sections: Section[]) => {
                                                if (sections.length === 0) return null
                                                return (
                                                    <div style={{ border: `1px solid ${accent}33`, borderRadius: '8px', overflow: 'hidden' }}>
                                                        <div style={{ padding: '12px 16px', background: `${accent}15`, borderBottom: `1px solid ${accent}22`, display: 'flex', alignItems: 'center', gap: '10px' }}>
                                                            <span style={{ fontSize: '18px' }}>{emoji}</span>
                                                            <span style={{ fontSize: '14px', fontWeight: 600, color: accent }}>{title}</span>
                                                            <span style={{ marginLeft: 'auto', fontSize: '12px', color: '#888' }}>{sections.reduce((s, sec) => s + sec.prompts.length, 0)} prompts</span>
                                                        </div>
                                                        <div style={{ padding: '8px 12px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                                            {sections.map(section => (
                                                                <div key={section.id} style={{ background: '#1a1a1a', borderRadius: '6px', border: '1px solid #333', overflow: 'hidden' }}>
                                                                    <div style={{ padding: '8px 12px', fontSize: '12px', color: accent, fontWeight: 600, borderBottom: section.prompts.length > 0 ? '1px solid #333' : 'none', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                                                        <span>{section.name}</span>
                                                                        <span style={{ fontSize: '11px', color: '#666', fontFamily: 'monospace' }}>L{section.startLine}-{section.endLine}</span>
                                                                    </div>
                                                                    {section.prompts.map(prompt => (
                                                                        <div key={prompt.id} style={{ padding: '8px 12px', borderBottom: '1px solid #2a2a2a', fontSize: '13px' }} className="group">
                                                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px' }}>
                                                                                <div style={{ flex: 1 }}>
                                                                                    <span style={{ fontSize: '10px', color: '#555', fontFamily: 'monospace' }}>Line {prompt.lineNumber}</span>
                                                                                    <div style={{ color: '#ccc', fontFamily: 'monospace', lineHeight: 1.5, marginTop: '2px', wordBreak: 'break-word' }}>{prompt.template}</div>
                                                                                </div>
                                                                                <CopyButton text={prompt.template} />
                                                                            </div>
                                                                            {prompt.example && (
                                                                                <div style={{ marginTop: '6px', paddingLeft: '12px', borderLeft: `2px solid ${accent}44`, fontSize: '12px', color: '#888' }}>
                                                                                    <span style={{ fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Example: </span>
                                                                                    {prompt.example}
                                                                                </div>
                                                                            )}
                                                                        </div>
                                                                    ))}
                                                                </div>
                                                            ))}
                                                        </div>
                                                    </div>
                                                )
                                            }

                                            return (
                                                <>
                                                    {renderSectionGroup('NLP Prompts', '💬', '#10b981', nlpSections)}
                                                    {renderSectionGroup('Developer Prompts', '⚙️', '#a78bfa', devSections)}
                                                    {renderSectionGroup('Other Sections', '📋', '#64748b', otherSections)}
                                                </>
                                            )
                                        })()}
                                    </div>
                                )}

                                {/* Navigate to full detail page */}
                                <div style={{ marginTop: '20px', paddingTop: '16px', borderTop: '1px solid #3c3c3c', textAlign: 'center' }}>
                                    <button
                                        onClick={() => router.push(`/prompt/${selectedPage.id}`)}
                                        style={{
                                            padding: '8px 24px', fontSize: '13px', fontWeight: 600,
                                            background: '#007acc', color: '#fff', border: 'none',
                                            borderRadius: '6px', cursor: 'pointer'
                                        }}
                                    >
                                        Open Full Detail View →
                                    </button>
                                </div>
                            </div>
                        ) : (
                            /* Welcome Screen */
                            <div className="ide-welcome">
                                <div className="ide-welcome-icon">📂</div>
                                <h2>Agentic Prompt DB</h2>
                                <p>Select a file from the explorer to view its prompts and sections.</p>
                                <div style={{ marginTop: '24px', display: 'flex', gap: '16px', fontSize: '12px', color: '#888' }}>
                                    <div style={{ textAlign: 'center' }}>
                                        <div style={{ fontSize: '24px', fontWeight: 700, color: '#61dafb' }}>{Object.keys(groupedPages).length}</div>
                                        <div>Folders</div>
                                    </div>
                                    <div style={{ textAlign: 'center' }}>
                                        <div style={{ fontSize: '24px', fontWeight: 700, color: '#73c991' }}>{pages.length}</div>
                                        <div>Files</div>
                                    </div>
                                    <div style={{ textAlign: 'center' }}>
                                        <div style={{ fontSize: '24px', fontWeight: 700, color: '#e2b93d' }}>{pages.reduce((sum, p) => sum + p.totalLines, 0).toLocaleString()}</div>
                                        <div>Total LOC</div>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    )
}

