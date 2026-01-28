'use client'

import { useState, useEffect } from 'react'

// API Base URL from environment variable
const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000'

// --- Types ---
interface Prompt {
    id: string
    template: string
    example: string | null
    description: string | null
    lineNumber: number
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
                ? 'bg-green-500/20 text-green-300 border-green-500/30'
                : 'bg-white/5 text-gray-400 border-white/10 hover:bg-white/10 hover:text-white'
                }`}
        >
            {copied ? '✓ Copied' : 'Copy'}
        </button>
    )
}

const Badge = ({ children, color = 'blue' }: { children: React.ReactNode, color?: 'blue' | 'purple' | 'green' | 'amber' | 'red' }) => {
    const colors = {
        blue: 'bg-blue-500/10 text-blue-300 border-blue-500/20',
        purple: 'bg-purple-500/10 text-purple-300 border-purple-500/20',
        green: 'bg-green-500/10 text-green-300 border-green-500/20',
        amber: 'bg-amber-500/10 text-amber-300 border-amber-500/20',
        red: 'bg-red-500/10 text-red-300 border-red-500/20',
    }

    return (
        <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border ${colors[color]}`}>
            {children}
        </span>
    )
}

// Folder Card Component
const FolderCard = ({ folderName, pages, onSelectFile, isExpanded, onToggle }: {
    folderName: string
    pages: Page[]
    onSelectFile: (page: Page) => void
    isExpanded: boolean
    onToggle: () => void
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
        <div className={`glass-card rounded-2xl overflow-hidden transition-all duration-300 ${isExpanded ? 'ring-2 ring-indigo-500/50' : 'hover:ring-1 hover:ring-white/20'}`}>
            {/* Folder Header - Clickable */}
            <button
                onClick={onToggle}
                className="w-full p-8 text-left bg-gradient-to-br from-slate-800/50 to-slate-900/50 hover:from-slate-700/50 hover:to-slate-800/50 transition-all"
            >
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-5">
                        <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shadow-lg shadow-indigo-500/20">
                            <span className="text-3xl">{isExpanded ? '📂' : '📁'}</span>
                        </div>
                        <div>
                            <h2 className="text-2xl font-bold text-white mb-1">{getDisplayName(folderName)}</h2>
                            <p className="text-sm text-slate-400 font-mono">{folderName}</p>
                        </div>
                    </div>

                    <div className="flex items-center gap-4">
                        {/* Stats - Fixed alignment with min-width */}
                        <div className="flex gap-6">
                            <div className="min-w-[60px] text-center">
                                <div className="text-xl font-bold text-indigo-400">{pages.length}</div>
                                <div className="text-xs text-slate-500 uppercase tracking-wide">Files</div>
                            </div>
                            <div className="min-w-[70px] text-center">
                                <div className="text-xl font-bold text-emerald-400">{totalLines.toLocaleString()}</div>
                                <div className="text-xs text-slate-500 uppercase tracking-wide">LOC</div>
                            </div>
                            <div className="min-w-[70px] text-center">
                                <div className="text-xl font-bold text-amber-400">{totalSections}</div>
                                <div className="text-xs text-slate-500 uppercase tracking-wide">Sections</div>
                            </div>
                            <div className="min-w-[70px] text-center">
                                <div className="text-xl font-bold text-pink-400">{totalPrompts}</div>
                                <div className="text-xs text-slate-500 uppercase tracking-wide">Prompts</div>
                            </div>
                        </div>

                        {/* Toggle Icon */}
                        <div className={`text-2xl text-slate-400 transition-transform duration-300 ml-2 ${isExpanded ? 'rotate-180' : ''}`}>
                            ▼
                        </div>
                    </div>
                </div>
            </button>


            {/* Files List - Expandable */}
            {isExpanded && (
                <div className="border-t border-white/10 bg-black/30">
                    <div className="p-4 space-y-2">
                        {pages.map((page) => (
                            <button
                                key={page.id}
                                onClick={() => onSelectFile(page)}
                                className="w-full flex items-center justify-between p-4 rounded-xl bg-slate-900/50 hover:bg-slate-800/70 border border-white/5 hover:border-indigo-500/30 transition-all group"
                            >
                                <div className="flex items-center gap-4">
                                    <span className="text-xl">📄</span>
                                    <div className="text-left">
                                        <div className="font-semibold text-white group-hover:text-indigo-300 transition-colors">
                                            {page.componentName}
                                        </div>
                                        <div className="text-xs text-slate-500 font-mono">
                                            {page.filePath.split('/').pop()}
                                        </div>
                                    </div>
                                </div>
                                <div className="flex items-center gap-4">
                                    <div className="min-w-[50px] text-center">
                                        <div className="text-sm font-bold text-indigo-400">{page.totalLines}</div>
                                        <div className="text-[10px] text-slate-500 uppercase">LOC</div>
                                    </div>
                                    <div className="min-w-[55px] text-center">
                                        <div className="text-sm font-bold text-emerald-400">{page.sections.length}</div>
                                        <div className="text-[10px] text-slate-500 uppercase">Sections</div>
                                    </div>
                                    <div className="min-w-[55px] text-center">
                                        <div className="text-sm font-bold text-pink-400">{page.sections.reduce((s, sec) => s + sec.prompts.length, 0)}</div>
                                        <div className="text-[10px] text-slate-500 uppercase">Prompts</div>
                                    </div>
                                    <span className="text-slate-500 group-hover:text-indigo-400 transition-colors ml-2">→</span>
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
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
            <div className="w-full max-w-6xl max-h-[90vh] overflow-hidden rounded-3xl glass-card border border-white/10 flex flex-col">
                {/* Header */}
                <div className="p-6 border-b border-white/10 bg-gradient-to-r from-slate-800/50 to-slate-900/50">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-4">
                            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center">
                                <span className="text-2xl">📄</span>
                            </div>
                            <div>
                                <h2 className="text-2xl font-bold text-white">{page.componentName}</h2>
                                <p className="text-sm text-slate-400 font-mono">{page.filePath}</p>
                            </div>
                        </div>
                        <div className="flex items-center gap-3">
                            {/* Stats */}
                            <div className="flex gap-4 mr-4">
                                <div className="text-center">
                                    <div className="text-xl font-bold text-indigo-400">{page.totalLines}</div>
                                    <div className="text-[10px] text-slate-500 uppercase">Lines of Code</div>
                                </div>
                                <div className="text-center">
                                    <div className="text-xl font-bold text-emerald-400">{page.sections.length}</div>
                                    <div className="text-[10px] text-slate-500 uppercase">Sections</div>
                                </div>
                            </div>
                            {page.rawContent && (
                                <>
                                    <button
                                        onClick={downloadFile}
                                        className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-xs rounded-lg border border-slate-600 transition-colors"
                                    >
                                        ⬇️ Download
                                    </button>
                                    <button
                                        onClick={() => setIsEditing(!isEditing)}
                                        className={`px-3 py-2 text-xs rounded-lg border transition-colors ${isEditing ? 'bg-indigo-600 border-indigo-500' : 'bg-slate-800 hover:bg-slate-700 border-slate-600'}`}
                                    >
                                        {isEditing ? '✏️ Editing' : '✏️ Edit'}
                                    </button>
                                </>
                            )}
                            <button
                                onClick={onClose}
                                className="w-10 h-10 flex items-center justify-center rounded-lg bg-slate-800 hover:bg-red-500/20 hover:text-red-400 transition-colors text-xl"
                            >
                                ×
                            </button>
                        </div>
                    </div>

                    {/* Purpose */}
                    <p className="mt-4 text-slate-300">{page.purpose}</p>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-auto p-6 space-y-4">
                    {/* Editor */}
                    {isEditing && page.rawContent && (
                        <div className="p-4 bg-black/50 border border-slate-700 rounded-xl">
                            <div className="flex justify-between items-center mb-2">
                                <span className="text-xs text-slate-400 font-mono">Editing {page.componentName}.txt</span>
                                <button
                                    onClick={async () => {
                                        const textarea = document.getElementById(`editor-${page.id}`) as HTMLTextAreaElement
                                        if (!textarea) return
                                        await onSave(page.id, textarea.value)
                                        setIsEditing(false)
                                    }}
                                    className="px-3 py-1 bg-green-600 hover:bg-green-500 text-xs rounded font-bold shadow-lg shadow-green-500/20 active:scale-95 transition-all"
                                >
                                    💾 Save & Reprocess
                                </button>
                            </div>
                            <textarea
                                id={`editor-${page.id}`}
                                className="w-full h-[400px] bg-slate-900 text-slate-300 font-mono text-xs p-4 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/50 resize-y"
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
                            className="w-full bg-slate-900/50 border border-slate-700/50 rounded-xl px-4 py-3 pl-10 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 text-sm"
                        />
                        <span className="absolute left-3 top-3.5 text-slate-500">🔍</span>
                    </div>

                    {/* Sections */}
                    {filteredSections.length > 0 ? (
                        <div className="space-y-3">
                            {filteredSections.map(section => {
                                const isExpanded = expandedSections.has(section.id) || !!searchQuery

                                return (
                                    <div key={section.id} className="glass-panel rounded-xl overflow-hidden border border-white/5 hover:border-indigo-500/30 transition-colors">
                                        <button
                                            onClick={() => toggleSection(section.id)}
                                            className="w-full flex items-center justify-between p-4 bg-white/5 hover:bg-white/10 transition-colors text-left"
                                        >
                                            <div className="flex items-center gap-4">
                                                <Badge color="blue">{section.name}</Badge>
                                                <span className="text-xs font-mono text-slate-500">L{section.startLine}-{section.endLine}</span>
                                            </div>
                                            <div className="text-slate-400 text-sm flex items-center gap-2">
                                                <span className="hidden md:inline text-xs opacity-50">{section.prompts.length} prompts</span>
                                                <span className={`transition-transform duration-300 ${isExpanded ? 'rotate-180' : ''}`}>▼</span>
                                            </div>
                                        </button>

                                        {isExpanded && (
                                            <div className="p-4 bg-black/20 space-y-3 border-t border-white/5">
                                                <p className="text-sm text-slate-400 mb-4 italic border-l-2 border-indigo-500 pl-3">
                                                    {section.purpose}
                                                </p>

                                                <div className="grid gap-3">
                                                    {section.prompts.map(prompt => (
                                                        <div key={prompt.id} className="group relative bg-slate-900/60 rounded-lg p-4 border border-white/5 hover:border-indigo-500/50 transition-all">
                                                            <div className="absolute right-2 top-2 opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-2">
                                                                <button
                                                                    onClick={(e) => {
                                                                        e.stopPropagation()
                                                                        scrollToLine(prompt.lineNumber || 1)
                                                                    }}
                                                                    className="text-xs px-2 py-1 rounded bg-indigo-500/20 text-indigo-300 hover:bg-indigo-500/40 border border-indigo-500/30 transition-colors"
                                                                    title="Edit this prompt in the source file"
                                                                >
                                                                    ✏️ Edit
                                                                </button>
                                                                <CopyButton text={prompt.template} />
                                                            </div>
                                                            <div className="mb-2">
                                                                <span className="text-[10px] uppercase font-bold text-slate-600 tracking-wider flex items-center gap-2">
                                                                    Template
                                                                    <span className="text-slate-700 font-mono font-normal">Line {prompt.lineNumber}</span>
                                                                </span>
                                                                <div className="font-mono text-sm text-indigo-300 mt-0.5">{prompt.template}</div>
                                                            </div>
                                                            {prompt.example && (
                                                                <div className="mt-2 pl-3 border-l-2 border-slate-700">
                                                                    <span className="text-[10px] uppercase font-bold text-slate-600 tracking-wider">Example</span>
                                                                    <div className="text-xs text-slate-400 mt-0.5">{prompt.example}</div>
                                                                </div>
                                                            )}
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                )
                            })}
                        </div>
                    ) : (
                        <div className="glass-panel rounded-xl p-12 text-center text-slate-400">
                            <p>No sections found. Click "Edit" to add sections.</p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    )
}

export default function Home() {
    const [pages, setPages] = useState<Page[]>([])
    const [masterPrompts, setMasterPrompts] = useState<MasterPrompt[]>([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [seeding, setSeeding] = useState(false)
    const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set())
    const [selectedPage, setSelectedPage] = useState<Page | null>(null)
    const [searchQuery, setSearchQuery] = useState('')

    useEffect(() => {
        fetchData()
    }, [])

    const fetchData = async () => {
        setLoading(true)
        setError(null)
        try {
            const response = await fetch(`${API_URL}/api/pages`)
            if (!response.ok) throw new Error('Failed to fetch data')
            const data = await response.json()
            setPages(data.pages || [])
            setMasterPrompts(data.masterPrompts || [])
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
            const response = await fetch(`${API_URL}/api/seed`, { method: 'POST' })
            const data = await response.json()
            if (data.success) {
                await fetchData()
            } else {
                throw new Error(data.error || 'Seeding failed')
            }
        } catch (err) {
            console.error('Seed error:', err)
            setError(err instanceof Error ? err.message : 'Failed to seed database')
        } finally {
            setSeeding(false)
        }
    }

    const handleSave = async (pageId: string, content: string) => {
        try {
            const updatedPages = pages.map(p =>
                p.id === pageId ? { ...p, rawContent: content } : p
            )
            setPages(updatedPages)

            const res = await fetch(`${API_URL}/api/save`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ pageId, content })
            })

            if (!res.ok) throw new Error('Save failed')

            await handleSeed()

            // Refresh selected page
            const response = await fetch(`${API_URL}/api/pages`)
            const data = await response.json()
            setPages(data.pages || [])
            const updatedPage = data.pages?.find((p: Page) => p.id === pageId)
            if (updatedPage) setSelectedPage(updatedPage)
        } catch (e) {
            console.error(e)
            alert('Failed to save changes')
        }
    }

    const toggleFolder = (folderName: string) => {
        const next = new Set(expandedFolders)
        if (next.has(folderName)) next.delete(folderName)
        else next.add(folderName)
        setExpandedFolders(next)
    }

    // Group pages by folder
    const groupedPages = pages.reduce((groups, page) => {
        const folder = page.filePath.substring(0, page.filePath.lastIndexOf('/')) || 'Root'
        if (!groups[folder]) groups[folder] = []
        groups[folder].push(page)
        return groups
    }, {} as Record<string, Page[]>)

    // Filter folders based on search
    const filteredFolders = Object.entries(groupedPages).filter(([folderName, folderPages]) => {
        if (!searchQuery) return true
        const q = searchQuery.toLowerCase()
        return folderName.toLowerCase().includes(q) ||
            folderPages.some(p =>
                p.componentName.toLowerCase().includes(q) ||
                p.filePath.toLowerCase().includes(q)
            )
    })

    return (
        <div className="min-h-screen text-slate-200 p-4 md:p-8 font-sans">
            {/* Navbar / Header */}
            <header className="max-w-7xl mx-auto mb-10 glass-panel rounded-2xl p-6 flex flex-col md:flex-row justify-between items-center gap-6">
                <div>
                    <h1 className="text-3xl font-extrabold bg-gradient-to-r from-indigo-400 to-purple-400 bg-clip-text text-transparent">
                        Agentic Prompt DB
                    </h1>
                    <p className="text-slate-400 mt-1">Centralized Instruction Metadata for HR Assist</p>
                </div>

                <div className="flex items-center gap-4">
                    <div className="relative group">
                        <input
                            type="text"
                            placeholder="Search folders & files..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="bg-slate-900/50 border border-slate-700/50 rounded-xl px-4 py-2 pl-10 w-64 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 text-sm transition-all"
                        />
                        <span className="absolute left-3 top-2.5 text-slate-500">🔍</span>
                    </div>

                    <button
                        onClick={handleSeed}
                        disabled={seeding}
                        className={`
              px-6 py-2 rounded-xl font-semibold text-sm transition-all flex items-center gap-2
              ${seeding
                                ? 'bg-slate-700 cursor-wait'
                                : 'bg-indigo-600 hover:bg-indigo-500 shadow-lg shadow-indigo-600/20 active:scale-95'
                            }
            `}
                    >
                        {seeding ? 'Syncing...' : '🔄 Sync All Prompts'}
                    </button>
                </div>
            </header>

            <main className="max-w-7xl mx-auto space-y-6">
                {/* Error State */}
                {error && (
                    <div className="bg-red-500/10 border border-red-500/20 rounded-2xl p-6 text-center animate-pulse-glow">
                        <p className="text-red-300 font-medium mb-4">⚠️ {error}</p>
                        <button onClick={handleSeed} className="text-xs px-4 py-2 rounded-lg bg-red-500/20 hover:bg-red-500/30 text-red-200 transition-colors">
                            Retry Seeding
                        </button>
                    </div>
                )}

                {/* Loading State */}
                {loading && !pages.length && (
                    <div className="flex justify-center py-20">
                        <div className="w-12 h-12 border-4 border-indigo-500/30 border-t-indigo-500 rounded-full animate-spin"></div>
                    </div>
                )}

                {/* Empty State */}
                {!loading && !pages.length && !error && (
                    <div className="text-center py-24 glass-panel rounded-3xl">
                        <div className="text-6xl mb-6 opacity-50">📭</div>
                        <h2 className="text-2xl font-bold text-slate-300 mb-4">Database is Empty</h2>
                        <p className="text-slate-500 max-w-md mx-auto mb-8">
                            The metadata database has not been populated yet. Click the seed button to import prompts from your codebase.
                        </p>
                        <button onClick={handleSeed} className="px-8 py-3 bg-indigo-600 hover:bg-indigo-500 rounded-xl font-bold shadow-lg shadow-indigo-500/25 transition-all">
                            Initialize Database
                        </button>
                    </div>
                )}

                {/* Folder Grid */}
                {filteredFolders.length > 0 && (
                    <div className="space-y-6">
                        {/* Stats Overview */}
                        <div className="grid grid-cols-3 gap-4">
                            <div className="glass-panel rounded-xl p-6 text-center">
                                <div className="text-3xl font-bold text-indigo-400">{Object.keys(groupedPages).length}</div>
                                <div className="text-sm text-slate-500 uppercase tracking-wide">Folders</div>
                            </div>
                            <div className="glass-panel rounded-xl p-6 text-center">
                                <div className="text-3xl font-bold text-emerald-400">{pages.length}</div>
                                <div className="text-sm text-slate-500 uppercase tracking-wide">Files</div>
                            </div>
                            <div className="glass-panel rounded-xl p-6 text-center">
                                <div className="text-3xl font-bold text-amber-400">{pages.reduce((sum, p) => sum + p.totalLines, 0).toLocaleString()}</div>
                                <div className="text-sm text-slate-500 uppercase tracking-wide">Total LOC</div>
                            </div>
                        </div>

                        {/* Folders */}
                        {filteredFolders.map(([folderName, folderPages]) => (
                            <FolderCard
                                key={folderName}
                                folderName={folderName}
                                pages={folderPages}
                                isExpanded={expandedFolders.has(folderName) || !!searchQuery}
                                onToggle={() => toggleFolder(folderName)}
                                onSelectFile={(page) => setSelectedPage(page)}
                            />
                        ))}
                    </div>
                )}
            </main>

            {/* File Detail Modal */}
            {selectedPage && (
                <FileDetailView
                    page={selectedPage}
                    masterPrompt={masterPrompts.find(m => m.pageFilePath === selectedPage.filePath)}
                    onClose={() => setSelectedPage(null)}
                    onSave={handleSave}
                />
            )}
        </div>
    )
}
