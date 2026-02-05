'use client'

import { useState, useEffect } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { apiRequest, getAccessToken, clearAuthData } from '@/lib/api'

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

// --- Constants ---
const KEYWORDS = {
    FRONTEND: ['frontend', 'ui', 'component', 'style', 'css', 'html', 'react', 'view', 'display', 'render', 'button', 'input', 'modal', 'page'],
    BACKEND: ['backend', 'api', 'server', 'route', 'controller', 'service', 'node', 'express', 'endpoint', 'logic', 'handler', 'auth', 'middleware'],
    DATABASE: ['database', 'db', 'sql', 'prisma', 'schema', 'model', 'query', 'table', 'migration', 'seed', 'entity']
}

// --- Components ---

const SidePanel = ({
    activeFilter,
    onFilterChange
}: {
    activeFilter: 'FRONTEND' | 'BACKEND' | 'DATABASE' | null,
    onFilterChange: (filter: 'FRONTEND' | 'BACKEND' | 'DATABASE' | null) => void
}) => {
    const buttons = [
        { id: 'FRONTEND', label: 'FRONTEND', color: 'blue' },
        { id: 'BACKEND', label: 'BACKEND', color: 'purple' },
        { id: 'DATABASE', label: 'DATABASE', color: 'emerald' }
    ] as const

    return (
        <div className="flex flex-col gap-2 p-2 bg-slate-900/50 rounded-xl border border-white/5 backdrop-blur-sm w-32">
            <div className="text-[10px] font-bold text-slate-500 uppercase tracking-widest text-center mb-1">Filter</div>
            {buttons.map((btn) => (
                <button
                    key={btn.id}
                    onClick={() => onFilterChange(activeFilter === btn.id ? null : btn.id)}
                    className={`
                        px-3 py-2 rounded-lg text-xs font-bold transition-all duration-300 relative overflow-hidden group
                        ${activeFilter === btn.id
                            ? `bg-${btn.color}-500/20 text-${btn.color}-300 border border-${btn.color}-500/50 shadow-lg shadow-${btn.color}-500/10`
                            : activeFilter
                                ? 'bg-slate-800/30 text-slate-600 border border-transparent' // Dimmed state when other active
                                : 'bg-slate-800/50 text-slate-400 hover:text-white hover:bg-slate-700 border border-white/5'
                        }
                    `}
                >
                    {/* Hover Glow Effect */}
                    <div className={`absolute inset-0 bg-gradient-to-r from-${btn.color}-500/0 via-${btn.color}-500/10 to-${btn.color}-500/0 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-1000`} />
                    <span className="relative z-10">{btn.label}</span>
                </button>
            ))}
        </div>
    )
}

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

export default function PromptDetailPage() {
    const router = useRouter()
    const params = useParams()
    const pageId = params.id as string

    const [page, setPage] = useState<Page | null>(null)
    const [masterPrompt, setMasterPrompt] = useState<MasterPrompt | null>(null)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set())
    const [isEditing, setIsEditing] = useState(false)
    const [searchQuery, setSearchQuery] = useState('')
    const [saving, setSaving] = useState(false)
    const [promptFilter, setPromptFilter] = useState<'BOTH' | 'NLP' | 'DEVELOPER'>('NLP')
    const [focusedFilter, setFocusedFilter] = useState<'FRONTEND' | 'BACKEND' | 'DATABASE' | null>(null)

    useEffect(() => {
        const token = getAccessToken()
        if (!token) {
            router.push('/login')
            return
        }
        fetchPageData()
    }, [pageId])

    const fetchPageData = async () => {
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
                const foundPage = result.data.pages.find(p => p.id === pageId)
                if (foundPage) {
                    setPage(foundPage)
                    const foundMasterPrompt = result.data.masterPrompts.find(m => m.pageFilePath === foundPage.filePath)
                    if (foundMasterPrompt) {
                        setMasterPrompt(foundMasterPrompt)
                    }
                } else {
                    setError('Prompt file not found')
                }
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

    const toggleSection = (id: string) => {
        const next = new Set(expandedSections)
        if (next.has(id)) next.delete(id)
        else next.add(id)
        setExpandedSections(next)
    }

    const scrollToLine = (line: number) => {
        if (!page?.rawContent) return

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
        if (!page?.rawContent) return
        const element = document.createElement("a")
        const file = new Blob([page.rawContent], { type: 'text/plain' })
        element.href = URL.createObjectURL(file)
        element.download = page.componentName + ".txt"
        document.body.appendChild(element)
        element.click()
        document.body.removeChild(element)
    }

    const handleSave = async () => {
        if (!page) return
        setSaving(true)
        try {
            const textarea = document.getElementById(`editor-${page.id}`) as HTMLTextAreaElement
            if (!textarea) return

            const content = textarea.value

            const saveResult = await apiRequest('/api/save', {
                method: 'POST',
                body: { pageId: page.id, content }
            })

            if (!saveResult.success) throw new Error('Save failed')

            // Re-seed the database
            await apiRequest('/api/seed', { method: 'POST' })

            // Refresh page data
            await fetchPageData()

            setIsEditing(false)
        } catch (e) {
            console.error(e)
            alert('Failed to save changes')
        } finally {
            setSaving(false)
        }
    }

    const filteredSections = page?.sections
        ? searchQuery
            ? page.sections.filter(s =>
                s.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                s.purpose.toLowerCase().includes(searchQuery.toLowerCase()) ||
                s.prompts.some(p => p.template.toLowerCase().includes(searchQuery.toLowerCase()))
            )
            : page.sections
        : []

    // Loading state
    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center">
                <div className="w-12 h-12 border-4 border-indigo-500/30 border-t-indigo-500 rounded-full animate-spin"></div>
            </div>
        )
    }

    // Error state
    if (error || !page) {
        return (
            <div className="min-h-screen flex items-center justify-center p-4">
                <div className="glass-panel rounded-2xl p-8 text-center max-w-md">
                    <div className="text-4xl mb-4">⚠️</div>
                    <h2 className="text-xl font-bold text-red-400 mb-2">{error || 'Page not found'}</h2>
                    <p className="text-slate-400 mb-6">The prompt file could not be loaded.</p>
                    <button
                        onClick={() => router.push('/')}
                        className="px-6 py-2 bg-indigo-600 hover:bg-indigo-500 rounded-lg font-semibold transition-all"
                    >
                        ← Back to Dashboard
                    </button>
                </div>
            </div>
        )
    }

    // Group sections by type
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
        <div className="min-h-screen text-slate-200 p-3 sm:p-4 md:p-6 lg:p-8 font-sans">
            {/* Header */}
            <header className="max-w-7xl mx-auto mb-6 sm:mb-8 glass-panel rounded-xl sm:rounded-2xl p-4 sm:p-6">
                <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4 sm:gap-6">
                    <div className="flex items-center gap-3 sm:gap-4 min-w-0">
                        {/* Back Button */}
                        <button
                            onClick={() => router.push('/')}
                            className="p-2 sm:p-2.5 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg sm:rounded-xl transition-all flex-shrink-0"
                            title="Back to Dashboard"
                        >
                            <svg className="w-4 h-4 sm:w-5 sm:h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                            </svg>
                        </button>
                        <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-lg sm:rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center flex-shrink-0 shadow-lg shadow-indigo-500/20">
                            <span className="text-xl sm:text-2xl">📄</span>
                        </div>
                        <div className="min-w-0">
                            <h1 className="text-lg sm:text-xl lg:text-2xl font-bold text-white truncate">{page.componentName}</h1>
                            <p className="text-xs sm:text-sm text-slate-400 font-mono truncate">Prompt file for {page.componentName}.js</p>
                        </div>
                    </div>

                    <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
                        {/* Prompt Type Filter Radio Buttons */}
                        <div className="flex items-center gap-1 sm:gap-2 bg-slate-800/80 rounded-lg p-1 border border-slate-600/50">
                            <button
                                onClick={() => setPromptFilter('NLP')}
                                className={`px-2 sm:px-3 py-1.5 text-[10px] sm:text-xs font-medium rounded-md transition-all ${promptFilter === 'NLP'
                                    ? 'bg-gradient-to-r from-emerald-500 to-green-500 text-white shadow-lg shadow-emerald-500/30'
                                    : 'text-slate-400 hover:text-white hover:bg-slate-700/50'
                                    }`}
                            >
                                NLP
                            </button>
                            <button
                                onClick={() => setPromptFilter('DEVELOPER')}
                                className={`px-2 sm:px-3 py-1.5 text-[10px] sm:text-xs font-medium rounded-md transition-all ${promptFilter === 'DEVELOPER'
                                    ? 'bg-gradient-to-r from-purple-500 to-violet-500 text-white shadow-lg shadow-purple-500/30'
                                    : 'text-slate-400 hover:text-white hover:bg-slate-700/50'
                                    }`}
                            >
                                DEVELOPER
                            </button>
                            <button
                                onClick={() => setPromptFilter('BOTH')}
                                className={`px-2 sm:px-3 py-1.5 text-[10px] sm:text-xs font-medium rounded-md transition-all ${promptFilter === 'BOTH'
                                    ? 'bg-gradient-to-r from-indigo-500 to-purple-500 text-white shadow-lg shadow-indigo-500/30'
                                    : 'text-slate-400 hover:text-white hover:bg-slate-700/50'
                                    }`}
                            >
                                BOTH
                            </button>
                        </div>

                        {/* Stats */}
                        <div className="flex gap-3 sm:gap-4 mr-2 sm:mr-4">
                            <div className="text-center">
                                <div className="text-base sm:text-lg lg:text-xl font-bold text-indigo-400">{page.totalLines}</div>
                                <div className="text-[9px] sm:text-[10px] text-slate-500 uppercase">Lines</div>
                            </div>
                            <div className="text-center">
                                <div className="text-base sm:text-lg lg:text-xl font-bold text-emerald-400">{page.sections.length}</div>
                                <div className="text-[9px] sm:text-[10px] text-slate-500 uppercase">Sections</div>
                            </div>
                        </div>

                        {page.rawContent && (
                            <>
                                <button
                                    onClick={downloadFile}
                                    className="px-2 sm:px-3 py-1.5 sm:py-2 bg-slate-800 hover:bg-slate-700 text-[10px] sm:text-xs rounded-lg border border-slate-600 transition-colors"
                                >
                                    ⬇️ <span className="hidden xs:inline">Download</span>
                                </button>
                                <button
                                    onClick={() => setIsEditing(!isEditing)}
                                    className={`px-2 sm:px-3 py-1.5 sm:py-2 text-[10px] sm:text-xs rounded-lg border transition-colors ${isEditing ? 'bg-indigo-600 border-indigo-500' : 'bg-slate-800 hover:bg-slate-700 border-slate-600'}`}
                                >
                                    ✏️ <span className="hidden xs:inline">{isEditing ? 'Editing' : 'Edit'}</span>
                                </button>
                            </>
                        )}
                        {/* Close Button */}
                        <button
                            onClick={() => router.push('/')}
                            className="p-1.5 sm:p-2 bg-slate-800 hover:bg-red-600/80 text-slate-400 hover:text-white rounded-lg border border-slate-600 hover:border-red-500 transition-all"
                            title="Close"
                        >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                        </button>
                    </div>
                </div>

                {/* Purpose */}
                <p className="mt-3 sm:mt-4 text-sm sm:text-base text-slate-300 line-clamp-2">{page.purpose}</p>
            </header>

            {/* Main Content */}
            <main className="max-w-7xl mx-auto space-y-4 sm:space-y-6">
                {/* Editor */}
                {isEditing && page.rawContent && (
                    <div className="glass-panel rounded-xl sm:rounded-2xl p-4 sm:p-6">
                        {(() => {
                            let editorContent = page.rawContent || ''
                            let editorTitle = `Editing ${page.componentName}.txt`

                            if (promptFilter === 'NLP') {
                                if (page.rawContent) {
                                    const lines = page.rawContent.split('\n')
                                    editorContent = nlpSections
                                        .sort((a, b) => a.startLine - b.startLine)
                                        .map(s => lines.slice(s.startLine - 1, s.endLine).join('\n'))
                                        .join('\n\n')
                                    editorTitle = 'Editing NLP Prompts (Read-only view)'
                                }
                            } else if (promptFilter === 'DEVELOPER') {
                                if (page.rawContent) {
                                    const lines = page.rawContent.split('\n')
                                    editorContent = devSections
                                        .sort((a, b) => a.startLine - b.startLine)
                                        .map(s => lines.slice(s.startLine - 1, s.endLine).join('\n'))
                                        .join('\n\n')
                                    editorTitle = 'Editing Developer Prompts (Read-only view)'
                                }
                            }

                            return (
                                <>
                                    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 mb-3">
                                        <div className="flex items-center gap-2">
                                            <span className="text-emerald-400">✏️</span>
                                            <span className="text-sm sm:text-base font-medium text-white">{editorTitle}</span>
                                        </div>
                                        <button
                                            onClick={handleSave}
                                            disabled={saving || promptFilter !== 'BOTH'}
                                            className={`px-3 sm:px-4 py-1.5 sm:py-2 text-xs sm:text-sm rounded-lg font-bold shadow-lg transition-all ${promptFilter === 'BOTH'
                                                ? 'bg-green-600 hover:bg-green-500 disabled:bg-green-800 shadow-green-500/20 active:scale-95'
                                                : 'bg-slate-700 text-slate-400 cursor-not-allowed'
                                                }`}
                                            title={promptFilter !== 'BOTH' ? "Switch to 'BOTH' view to save changes" : "Save changes"}
                                        >
                                            {promptFilter === 'BOTH' ? (saving ? '💾 Saving...' : '💾 Save & Reprocess') : '🔒 Switch to BOTH to Save'}
                                        </button>
                                    </div>
                                    <textarea
                                        key={promptFilter}
                                        id={`editor-${page.id}`}
                                        className="w-full h-[350px] sm:h-[450px] lg:h-[500px] bg-slate-900 text-slate-300 font-mono text-[10px] sm:text-xs p-4 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/50 resize-y border border-slate-700"
                                        defaultValue={editorContent}
                                    />
                                </>
                            )
                        })()}
                    </div>
                )}

                {/* Content View - Text Based */}
                <div className="flex flex-col md:flex-row gap-4 items-start relative">
                    {/* Side Panel - Sticky */}
                    <div className="hidden md:block sticky top-24 z-10">
                        <SidePanel activeFilter={focusedFilter} onFilterChange={setFocusedFilter} />
                    </div>

                    <div className="flex-1 min-w-0 w-full">
                        {(() => {
                            // Helper to render content with highlighting
                            const renderHighlightedContent = (content: string | null | undefined, type: 'NLP' | 'DEV') => {
                                if (!content) return <span className="text-slate-500 italic">No {type} content found</span>

                                return content.split('\n').map((line, i) => {
                                    // Identify content type based on keywords if a filter is active
                                    let isMatch = false
                                    let lineClass = 'highlight-line block min-h-[1.2em] '

                                    if (focusedFilter) {
                                        const lowerLine = line.toLowerCase()
                                        // Check for explicit tags first (e.g., [FRONTEND]) or keywords
                                        const keywords = KEYWORDS[focusedFilter]

                                        // Simple match: if line contains any keyword
                                        // We might want to be stricter, but for now specific keywords work best
                                        isMatch = keywords.some(k => lowerLine.includes(k)) ||
                                            lowerLine.includes(`[${focusedFilter.toLowerCase()}]`)

                                        if (isMatch) {
                                            lineClass += `highlight-${focusedFilter.toLowerCase()} font-medium `
                                        } else {
                                            lineClass += 'highlight-dimmed '
                                        }
                                    }

                                    return (
                                        <span key={i} className={lineClass}>
                                            {line}
                                        </span>
                                    )
                                })
                            }
                            // For BOTH view - show side-by-side columns
                            if (promptFilter === 'BOTH') {
                                const lines = page.rawContent?.split('\n') || []
                                const nlpContent = nlpSections
                                    .sort((a, b) => a.startLine - b.startLine)
                                    .map(s => lines.slice(s.startLine - 1, s.endLine).join('\n'))
                                    .join('\n\n')
                                const devContent = devSections
                                    .sort((a, b) => a.startLine - b.startLine)
                                    .map(s => lines.slice(s.startLine - 1, s.endLine).join('\n'))
                                    .join('\n\n')

                                if (!nlpContent && !devContent) {
                                    return (
                                        <div className="glass-panel rounded-xl sm:rounded-2xl p-12 text-center text-slate-400">
                                            <p>No content found for this section.</p>
                                        </div>
                                    )
                                }

                                return (
                                    <div className="glass-panel rounded-xl sm:rounded-2xl p-4 sm:p-6 overflow-hidden">
                                        {/* Two-column layout for BOTH view */}
                                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                                            {/* NLP Column */}
                                            <div className="flex flex-col">
                                                <div className="flex justify-between items-center mb-3 pb-2 border-b border-emerald-500/30">
                                                    <h3 className="text-sm sm:text-base font-semibold text-emerald-400 flex items-center gap-2">
                                                        <span className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse"></span>
                                                        NLP Prompt
                                                    </h3>
                                                    <CopyButton text={nlpContent} />
                                                </div>
                                                <div className="bg-slate-900/50 rounded-lg border border-slate-700/50 overflow-hidden" style={{ height: '600px' }}>
                                                    <pre className="text-slate-300 font-mono text-[10px] sm:text-xs p-4 whitespace-pre-wrap h-full overflow-y-auto custom-scrollbar">
                                                        {renderHighlightedContent(nlpContent, 'NLP')}
                                                    </pre>
                                                </div>
                                            </div>

                                            {/* Developer Column */}
                                            <div className="flex flex-col">
                                                <div className="flex justify-between items-center mb-3 pb-2 border-b border-purple-500/30">
                                                    <h3 className="text-sm sm:text-base font-semibold text-purple-400 flex items-center gap-2">
                                                        <span className="w-2 h-2 bg-purple-500 rounded-full animate-pulse"></span>
                                                        Developer Prompt
                                                    </h3>
                                                    <CopyButton text={devContent} />
                                                </div>
                                                <div className="bg-slate-900/50 rounded-lg border border-slate-700/50 overflow-hidden" style={{ height: '600px' }}>
                                                    <pre className="text-slate-300 font-mono text-[10px] sm:text-xs p-4 whitespace-pre-wrap h-full overflow-y-auto custom-scrollbar">
                                                        {renderHighlightedContent(devContent, 'DEV')}
                                                    </pre>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                )
                            }

                            // For NLP or DEVELOPER individual views - show single column
                            let contentToDisplay = ''

                            if (promptFilter === 'NLP') {
                                if (page.rawContent) {
                                    const lines = page.rawContent.split('\n')
                                    contentToDisplay = nlpSections
                                        .sort((a, b) => a.startLine - b.startLine)
                                        .map(s => lines.slice(s.startLine - 1, s.endLine).join('\n'))
                                        .join('\n\n')
                                }
                            } else if (promptFilter === 'DEVELOPER') {
                                if (page.rawContent) {
                                    const lines = page.rawContent.split('\n')
                                    contentToDisplay = devSections
                                        .sort((a, b) => a.startLine - b.startLine)
                                        .map(s => lines.slice(s.startLine - 1, s.endLine).join('\n'))
                                        .join('\n\n')
                                }
                            }

                            if (!contentToDisplay) {
                                return (
                                    <div className="glass-panel rounded-xl sm:rounded-2xl p-12 text-center text-slate-400">
                                        <p>No content found for this section.</p>
                                    </div>
                                )
                            }


                            // Single Column View (NLP or DEVELOPER)
                            return (
                                <div className="glass-panel rounded-xl sm:rounded-2xl p-4 sm:p-6 overflow-hidden">
                                    <div className="flex justify-between items-center mb-2">
                                        {/* Mobile Toggle for Filter (if we wanted one, but SidePanel handles it largely) */}
                                        <div className="md:hidden">
                                            <SidePanel activeFilter={focusedFilter} onFilterChange={setFocusedFilter} />
                                        </div>
                                        <div className="ml-auto">
                                            <CopyButton text={contentToDisplay} />
                                        </div>
                                    </div>
                                    <pre className="bg-slate-900/50 text-slate-300 font-mono text-[10px] sm:text-xs p-4 rounded-lg overflow-x-auto whitespace-pre-wrap border border-slate-700/50 h-[calc(100vh-300px)] custom-scrollbar">
                                        {renderHighlightedContent(contentToDisplay, promptFilter === 'NLP' ? 'NLP' : 'DEV')}
                                    </pre>
                                </div>
                            )
                        })()}
                    </div>
                </div>
            </main>
        </div>
    )
}
