'use client'

import { useState, useEffect } from 'react'
import Image from 'next/image'

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

export default function Home() {
    const [pages, setPages] = useState<Page[]>([])
    const [masterPrompts, setMasterPrompts] = useState<MasterPrompt[]>([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [seeding, setSeeding] = useState(false)
    const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set())
    const [viewingRaw, setViewingRaw] = useState<string | null>(null) // ID of page being viewed as raw
    const [searchQuery, setSearchQuery] = useState('')

    useEffect(() => {
        fetchData()
    }, [])

    const fetchData = async () => {
        setLoading(true)
        setError(null)
        try {
            const response = await fetch('/api/pages')
            if (!response.ok) throw new Error('Failed to fetch data')
            const data = await response.json()
            setPages(data.pages || [])
            setMasterPrompts(data.masterPrompts || [])
        } catch (err) {
            console.error('Fetch error:', err)
            setError('Could not load data. Ensure the database is running and seeded.')
        } finally {
            setLoading(false)
        }
    }

    const scrollToLine = (pageId: string, line: number) => {
        // Find the page to get content
        const page = pages.find(p => p.id === pageId)
        if (!page?.rawContent) return

        // Calculate character position
        const lines = page.rawContent.split('\n')
        // Safe access to split lines
        if (line < 1) line = 1
        if (line > lines.length) line = lines.length

        const pos = lines.slice(0, line - 1).join('\n').length

        setViewingRaw(pageId)

        // Wait for textarea to mount
        setTimeout(() => {
            const textarea = document.getElementById(`editor-${pageId}`) as HTMLTextAreaElement
            if (textarea) {
                textarea.focus()
                textarea.setSelectionRange(pos, pos + lines[line - 1].length)
                // Try to center the line
                const lineHeight = 16 // approximate line height in pixels
                textarea.scrollTop = (line - 1) * lineHeight - (textarea.clientHeight / 2)
            }
        }, 100)
    }

    const handleSeed = async () => {
        setSeeding(true)
        setError(null)
        try {
            const response = await fetch('/api/seed', { method: 'POST' })
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

    const toggleSection = (id: string) => {
        const next = new Set(expandedSections)
        if (next.has(id)) next.delete(id)
        else next.add(id)
        setExpandedSections(next)
    }

    const filteredSections = (sections: Section[]) => {
        if (!searchQuery) return sections
        const q = searchQuery.toLowerCase()
        return sections.filter(s =>
            s.name.toLowerCase().includes(q) ||
            s.purpose.toLowerCase().includes(q) ||
            s.prompts.some(p => p.template.toLowerCase().includes(q))
        )
    }

    const downloadFile = (fileName: string, content: string | null) => {
        if (!content) return
        const element = document.createElement("a");
        const file = new Blob([content], { type: 'text/plain' });
        element.href = URL.createObjectURL(file);
        element.download = fileName + ".txt";
        document.body.appendChild(element); // Required for this to work in FireFox
        element.click();
        document.body.removeChild(element);
    }

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
                            placeholder="Search prompts..."
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

            <main className="max-w-7xl mx-auto space-y-12">
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

                {/* Content */}
                {/* Folder Grouped Content */}
                {Object.entries(
                    pages.reduce((groups, page) => {
                        const folder = page.filePath.substring(0, page.filePath.lastIndexOf('/')) || 'Root';
                        if (!groups[folder]) groups[folder] = [];
                        groups[folder].push(page);
                        return groups;
                    }, {} as Record<string, Page[]>)
                ).map(([folderName, folderPages]) => (
                    <div key={folderName} className="space-y-4">
                        {/* Folder Header */}
                        <div className="flex items-center gap-3 pb-2 border-b border-white/10 mt-12 mb-6">
                            <span className="text-2xl">📂</span>
                            <h2 className="text-xl font-bold text-slate-200">{folderName}</h2>
                            <span className="text-xs bg-slate-800 text-slate-400 px-2 py-0.5 rounded-full">
                                {folderPages.length} files
                            </span>
                        </div>

                        {/* Files in Folder */}
                        {folderPages.map((page, idx) => {
                            const master = masterPrompts.find(m => m.pageFilePath === page.filePath);

                            // Just render the page block as before, but mapped within this folder
                            return (
                                <div key={page.id} className="space-y-8 fade-enter mb-12" style={{ animationDelay: `${idx * 100}ms` }}>

                                    {/* File Header Card */}
                                    <div className="glass-card rounded-2xl p-8 relative overflow-hidden group">
                                        <div className="absolute top-0 right-0 p-32 bg-indigo-500/10 blur-[100px] rounded-full group-hover:bg-indigo-500/20 transition-all duration-1000"></div>

                                        <div className="relative z-10 flex flex-col md:flex-row gap-8">
                                            <div className="flex-1">
                                                <div className="flex items-center gap-3 mb-2">
                                                    <Badge color="purple">COMPONENT</Badge>
                                                    <span className="text-slate-500 text-xs font-mono">{page.filePath}</span>
                                                </div>
                                                <div className="flex items-center gap-4">
                                                    <h2 className="text-4xl font-bold text-white mb-4 tracking-tight">{page.componentName}</h2>

                                                    {/* Action Buttons */}
                                                    <div className="flex gap-2 mb-4">
                                                        {page.rawContent && (
                                                            <button
                                                                onClick={() => downloadFile(page.componentName, page.rawContent)}
                                                                className="px-3 py-1 bg-slate-800 hover:bg-slate-700 text-xs rounded border border-slate-600 transition-colors"
                                                                title="Download original prompt file"
                                                            >
                                                                ⬇️ Download
                                                            </button>
                                                        )}
                                                        {page.rawContent && (
                                                            <button
                                                                onClick={() => setViewingRaw(viewingRaw === page.id ? null : page.id)}
                                                                className={`px-3 py-1 text-xs rounded border transition-colors flex items-center gap-1 ${viewingRaw === page.id ? 'bg-indigo-600 border-indigo-500' : 'bg-slate-800 hover:bg-slate-700 border-slate-600'}`}
                                                            >
                                                                {viewingRaw === page.id ? <span>✏️ Editing</span> : <span>✏️ Edit Prompt</span>}
                                                            </button>
                                                        )}
                                                    </div>
                                                </div>
                                                <p className="text-lg text-slate-300 leading-relaxed text-balance">{page.purpose}</p>

                                                {/* Raw Content Viewer / Editor */}
                                                {viewingRaw === page.id && page.rawContent && (
                                                    <div className="mt-6 p-4 bg-black/50 border border-slate-700 rounded-xl">
                                                        <div className="flex justify-between items-center mb-2">
                                                            <span className="text-xs text-slate-400 font-mono">Editing {page.componentName}.txt</span>
                                                            <button
                                                                onClick={async () => {
                                                                    const textarea = document.getElementById(`editor-${page.id}`) as HTMLTextAreaElement;
                                                                    if (!textarea) return;

                                                                    const content = textarea.value;
                                                                    try {
                                                                        // Optimistic UI update
                                                                        const updatedPages = pages.map(p =>
                                                                            p.id === page.id ? { ...p, rawContent: content } : p
                                                                        );
                                                                        setPages(updatedPages);

                                                                        const res = await fetch('/api/save', {
                                                                            method: 'POST',
                                                                            headers: { 'Content-Type': 'application/json' },
                                                                            body: JSON.stringify({ pageId: page.id, content })
                                                                        });

                                                                        if (!res.ok) throw new Error('Save failed');

                                                                        // Trigger re-seed to re-parse sections
                                                                        handleSeed();
                                                                    } catch (e) {
                                                                        console.error(e);
                                                                        alert('Failed to save changes');
                                                                    }
                                                                }}
                                                                className="px-3 py-1 bg-green-600 hover:bg-green-500 text-xs rounded font-bold shadow-lg shadow-green-500/20 active:scale-95 transition-all"
                                                            >
                                                                💾 Save & Reprocess
                                                            </button>
                                                        </div>
                                                        <textarea
                                                            id={`editor-${page.id}`}
                                                            className="w-full h-[500px] bg-slate-900 text-slate-300 font-mono text-xs p-4 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/50 resize-y"
                                                            defaultValue={page.rawContent}
                                                        />
                                                    </div>
                                                )}
                                            </div>

                                            {/* Stats Mini-Grid */}
                                            <div className="grid grid-cols-2 gap-4 min-w-[300px]">
                                                <div className="bg-slate-900/40 rounded-xl p-4 border border-white/5">
                                                    <div className="text-2xl font-bold text-indigo-400">{page.totalLines}</div>
                                                    <div className="text-xs text-slate-500 font-bold uppercase tracking-wider">Lines Of Code</div>
                                                </div>
                                                <div className="bg-slate-900/40 rounded-xl p-4 border border-white/5">
                                                    <div className="text-2xl font-bold text-emerald-400">{page.sections.length}</div>
                                                    <div className="text-xs text-slate-500 font-bold uppercase tracking-wider">Logic Sections</div>
                                                </div>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Simplied Stack Layout */}
                                    <div className="space-y-4">
                                        <h3 className="font-bold text-slate-200 mb-2 flex items-center gap-2 text-xl px-2">
                                            <span>📑</span> Modification Prompts
                                        </h3>

                                        {filteredSections(page.sections).length > 0 ? (
                                            filteredSections(page.sections).map(section => {
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

                                                        {(isExpanded) && (
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
                                                                                        scrollToLine(page.id, prompt.lineNumber || 1)
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
                                            })
                                        ) : (
                                            <div className="glass-panel rounded-xl p-12 text-center text-slate-400">
                                                <p>No specific sections parsed. Click "Edit Prompt" to add sections.</p>
                                            </div>
                                        )}
                                    </div>

                                </div>
                            )
                        })}
                    </div>
                ))}
            </main>
        </div>
    )
}
