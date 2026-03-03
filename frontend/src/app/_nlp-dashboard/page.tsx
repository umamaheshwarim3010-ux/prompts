'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { apiRequest, getAccessToken, clearAuthData, verifyToken } from '@/lib/api'
import { ThemeToggle } from '@/components/ThemeToggle'

// ==========================================
// Types
// ==========================================
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

interface Page {
    id: string
    filePath: string
    componentName: string
    totalLines: number
    purpose: string
    rawContent: string | null
    promptFilePath: string | null
    sections: Section[]
    stateVars: any[]
    functions: any[]
}

interface Project {
    id: string
    name: string
    path: string
    isActive: boolean
}

// ==========================================
// NLP Dashboard Component
// ==========================================
export default function NLPDashboard() {
    const router = useRouter()

    // State
    const [pages, setPages] = useState<Page[]>([])
    const [loading, setLoading] = useState(true)
    const [syncing, setSyncing] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [activeProject, setActiveProject] = useState<Project | null>(null)
    const [selectedPageId, setSelectedPageId] = useState<string | null>(null)
    const [expandedPages, setExpandedPages] = useState<Set<string>>(new Set())
    const [searchQuery, setSearchQuery] = useState('')
    const [initialSyncDone, setInitialSyncDone] = useState(false)

    // Sidebar resize
    const [sidebarWidth, setSidebarWidth] = useState(300)
    const isResizing = useRef(false)
    const startX = useRef(0)
    const startWidth = useRef(300)

    const handleMouseDown = useCallback((e: React.MouseEvent) => {
        isResizing.current = true
        startX.current = e.clientX
        startWidth.current = sidebarWidth
        document.body.style.cursor = 'col-resize'
        document.body.style.userSelect = 'none'

        const handleMouseMove = (e: MouseEvent) => {
            if (!isResizing.current) return
            const delta = e.clientX - startX.current
            const newWidth = Math.min(Math.max(startWidth.current + delta, 220), 500)
            setSidebarWidth(newWidth)
        }

        const handleMouseUp = () => {
            isResizing.current = false
            document.body.style.cursor = ''
            document.body.style.userSelect = ''
            document.removeEventListener('mousemove', handleMouseMove)
            document.removeEventListener('mouseup', handleMouseUp)
        }

        document.addEventListener('mousemove', handleMouseMove)
        document.addEventListener('mouseup', handleMouseUp)
    }, [sidebarWidth])

    // ==========================================
    // Init: Auth check + load active project
    // ==========================================
    useEffect(() => {
        initDashboard()
    }, [])

    const initDashboard = async () => {
        const token = getAccessToken()
        if (!token) {
            router.push('/login')
            return
        }

        const verification = await verifyToken()
        if (!verification.valid || !verification.user) {
            clearAuthData()
            router.push('/login')
            return
        }

        // Get active project for user
        const result = await apiRequest<{ success: boolean; project: Project }>(
            `/api/projects/user/${verification.user.id}/active`
        )

        if (result.success && result.data?.project) {
            setActiveProject(result.data.project)
            // Auto-sync on first load, then just load pages
            await syncAndLoad(result.data.project.id)
        } else {
            // No active project — redirect to project hub
            router.push('/home')
        }
    }

    const syncAndLoad = async (projectId: string) => {
        if (!initialSyncDone) {
            setSyncing(true)
            setError(null)
            try {
                const syncResult = await apiRequest('/api/seed', {
                    method: 'POST',
                    body: { projectId }
                })
                if (!syncResult.success) {
                    console.warn('Sync warning:', syncResult.error)
                }
                setInitialSyncDone(true)
            } catch (err) {
                console.error('Sync error:', err)
            } finally {
                setSyncing(false)
            }
        }
        await loadPages(projectId)
    }

    const loadPages = async (projectId: string) => {
        setLoading(true)
        setError(null)
        try {
            const result = await apiRequest<{ pages: Page[]; masterPrompts: any[] }>(
                `/api/pages?projectId=${projectId}`
            )
            if (result.status === 401) {
                clearAuthData()
                router.push('/login')
                return
            }
            if (result.success && result.data) {
                setPages(result.data.pages || [])
            } else {
                throw new Error(result.error || 'Failed to fetch pages')
            }
        } catch (err) {
            console.error('Load error:', err)
            setError('Could not load data. Ensure the backend server is running.')
        } finally {
            setLoading(false)
        }
    }

    const handleSync = async () => {
        if (!activeProject) return
        setSyncing(true)
        setError(null)
        try {
            await apiRequest('/api/seed', {
                method: 'POST',
                body: { projectId: activeProject.id }
            })
            await loadPages(activeProject.id)
        } catch (err) {
            setError('Sync failed')
        } finally {
            setSyncing(false)
        }
    }

    // ==========================================
    // Sidebar interactions
    // ==========================================
    const togglePage = (pageId: string) => {
        const next = new Set(expandedPages)
        if (next.has(pageId)) next.delete(pageId)
        else next.add(pageId)
        setExpandedPages(next)
    }

    const selectPage = (pageId: string) => {
        setSelectedPageId(pageId)
    }

    const selectedPage = pages.find(p => p.id === selectedPageId) || null

    // Pages with prompts (have prompt files or sections)
    const promptPages = pages.filter(p => p.promptFilePath || p.sections.length > 0)

    // Code-only pages (no prompts)
    const codeOnlyPages = pages.filter(p => !p.promptFilePath && p.sections.length === 0)

    // Get NLP prompts for a page
    const getNLPPrompts = (page: Page): Prompt[] => {
        return page.sections.flatMap(s =>
            s.prompts.filter(p => p.promptType === 'NLP')
        )
    }

    // Filter pages based on search
    const filteredPromptPages = promptPages.filter(p => {
        if (!searchQuery) return true
        const q = searchQuery.toLowerCase()
        return p.componentName.toLowerCase().includes(q) ||
            p.filePath.toLowerCase().includes(q)
    })

    const filteredCodePages = codeOnlyPages.filter(p => {
        if (!searchQuery) return true
        const q = searchQuery.toLowerCase()
        return p.componentName.toLowerCase().includes(q) ||
            p.filePath.toLowerCase().includes(q)
    })

    // Group pages by folder path
    const groupByFolder = (pageList: Page[]) => {
        const groups: Record<string, Page[]> = {}
        for (const p of pageList) {
            const folder = p.filePath.substring(0, p.filePath.lastIndexOf('/')) || 'root'
            if (!groups[folder]) groups[folder] = []
            groups[folder].push(p)
        }
        return groups
    }

    // ==========================================
    // Loading state
    // ==========================================
    if (loading && !pages.length) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-[#0a0a1a]">
                <div className="flex flex-col items-center gap-4">
                    <div className="relative">
                        <div className="w-14 h-14 border-4 border-indigo-500/20 rounded-full" />
                        <div className="absolute inset-0 w-14 h-14 border-4 border-transparent border-t-indigo-500 rounded-full animate-spin" />
                    </div>
                    <div className="text-center">
                        <p className="text-slate-600 dark:text-slate-300 font-medium text-sm">
                            {syncing ? 'Syncing project files...' : 'Loading dashboard...'}
                        </p>
                        {activeProject && (
                            <p className="text-slate-400 dark:text-slate-500 text-xs mt-1">
                                {activeProject.name}
                            </p>
                        )}
                    </div>
                </div>
            </div>
        )
    }

    // ==========================================
    // Render
    // ==========================================
    return (
        <div className="min-h-screen flex flex-col bg-slate-50 dark:bg-[#0a0a1a] text-slate-800 dark:text-slate-200 font-sans">
            {/* ====== HEADER ====== */}
            <header className="flex items-center justify-between px-4 h-14 border-b border-slate-200/80 dark:border-white/[.06] bg-white/90 dark:bg-[#111128]/90 backdrop-blur-xl z-30 flex-shrink-0">
                <div className="flex items-center gap-3 min-w-0">
                    <button
                        id="nlp-back-btn"
                        onClick={() => router.push('/home')}
                        className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/[.06] transition-all duration-200"
                        title="Back to Projects"
                    >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                        </svg>
                    </button>
                    <div className="flex items-center gap-2.5">
                        <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shadow-md shadow-indigo-500/20">
                            <svg className="w-3.5 h-3.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                            </svg>
                        </div>
                        <div>
                            <h1 className="text-sm font-bold bg-gradient-to-r from-indigo-600 to-purple-600 dark:from-indigo-400 dark:to-purple-400 bg-clip-text text-transparent leading-tight">
                                Agentic Prompt DB
                            </h1>
                            {activeProject && (
                                <p className="text-[10px] text-slate-400 dark:text-slate-500 leading-tight -mt-0.5">
                                    {activeProject.name}
                                </p>
                            )}
                        </div>
                    </div>
                </div>

                <div className="flex items-center gap-2">
                    {/* Developer Dashboard Button */}
                    <button
                        id="dev-dashboard-btn"
                        onClick={() => router.push('/dev-dashboard')}
                        className="px-3.5 py-1.5 rounded-lg text-xs font-semibold bg-slate-100 dark:bg-white/[.06] text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-white/[.1] border border-slate-200 dark:border-white/[.08] transition-all duration-200 flex items-center gap-1.5"
                    >
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
                        </svg>
                        Developer
                    </button>

                    {/* Sync Button */}
                    <button
                        id="nlp-sync-btn"
                        onClick={handleSync}
                        disabled={syncing}
                        className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all duration-200 flex items-center gap-1.5 ${syncing
                                ? 'bg-indigo-500/20 text-indigo-400 cursor-wait'
                                : 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-500/20 border border-indigo-500/20'
                            }`}
                    >
                        <svg className={`w-3.5 h-3.5 ${syncing ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                        </svg>
                        {syncing ? 'Syncing...' : 'Sync'}
                    </button>

                    <ThemeToggle />
                </div>
            </header>

            {/* Error Banner */}
            {error && (
                <div className="mx-3 mt-2 bg-red-500/10 border border-red-500/20 rounded-lg p-2.5 flex items-center gap-2.5 animate-in">
                    <span className="text-sm">⚠️</span>
                    <p className="text-xs text-red-600 dark:text-red-400 flex-1">{error}</p>
                    <button onClick={() => setError(null)} className="text-red-400 hover:text-red-300 text-sm font-bold">×</button>
                </div>
            )}

            {/* ====== MAIN CONTENT ====== */}
            <div className="flex flex-1 overflow-hidden">
                {/* ====== LEFT SIDEBAR ====== */}
                <aside
                    className="flex-shrink-0 border-r border-slate-200/80 dark:border-white/[.06] bg-white/60 dark:bg-[#0d0d20]/60 backdrop-blur-sm overflow-hidden flex flex-col"
                    style={{ width: `${sidebarWidth}px` }}
                >
                    {/* Sidebar Header */}
                    <div className="px-3 py-2.5 border-b border-slate-200/60 dark:border-white/[.04]">
                        <div className="flex items-center gap-2">
                            <div className="relative flex-1">
                                <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <circle cx="11" cy="11" r="8" />
                                    <path d="M21 21l-4.35-4.35" />
                                </svg>
                                <input
                                    id="nlp-search-input"
                                    type="text"
                                    placeholder="Search pages..."
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    className="w-full pl-8 pr-3 py-1.5 rounded-md text-xs bg-slate-100 dark:bg-white/[.04] text-slate-700 dark:text-slate-300 placeholder-slate-400 dark:placeholder-slate-500 border border-slate-200 dark:border-white/[.06] focus:outline-none focus:ring-1 focus:ring-indigo-500/40 transition-all"
                                />
                            </div>
                        </div>
                    </div>

                    {/* Pages List */}
                    <div className="flex-1 overflow-y-auto py-1.5 nlp-sidebar-scroll">
                        {/* Prompt Pages Section */}
                        {filteredPromptPages.length > 0 && (
                            <div className="mb-2">
                                <div className="px-3 py-1.5 text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest">
                                    Pages with Prompts
                                </div>
                                {filteredPromptPages.map(page => {
                                    const nlpPrompts = getNLPPrompts(page)
                                    const isExpanded = expandedPages.has(page.id)
                                    const isSelected = selectedPageId === page.id

                                    return (
                                        <div key={page.id} className="mx-1.5">
                                            {/* Page Entry */}
                                            <button
                                                onClick={() => {
                                                    selectPage(page.id)
                                                    togglePage(page.id)
                                                }}
                                                className={`w-full flex items-center gap-2 px-2.5 py-2 rounded-lg text-left transition-all duration-150 group ${isSelected
                                                        ? 'bg-indigo-500/10 dark:bg-indigo-500/[.08] text-indigo-700 dark:text-indigo-300 shadow-sm shadow-indigo-500/5'
                                                        : 'hover:bg-slate-100 dark:hover:bg-white/[.03] text-slate-600 dark:text-slate-400'
                                                    }`}
                                            >
                                                {/* Chevron */}
                                                <svg
                                                    className={`w-3 h-3 flex-shrink-0 transition-transform duration-200 ${isExpanded ? 'rotate-90' : ''
                                                        } ${isSelected ? 'text-indigo-500' : 'text-slate-400 dark:text-slate-500'}`}
                                                    fill="currentColor"
                                                    viewBox="0 0 20 20"
                                                >
                                                    <path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" />
                                                </svg>

                                                {/* File Icon */}
                                                <svg className={`w-4 h-4 flex-shrink-0 ${isSelected ? 'text-indigo-500' : 'text-amber-500'}`} fill="currentColor" viewBox="0 0 20 20">
                                                    <path fillRule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4z" clipRule="evenodd" />
                                                </svg>

                                                {/* Page Name */}
                                                <span className="text-xs font-medium truncate flex-1">
                                                    {page.componentName}
                                                </span>

                                                {/* Prompt Count Badge */}
                                                {nlpPrompts.length > 0 && (
                                                    <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-bold ${isSelected
                                                            ? 'bg-indigo-500/20 text-indigo-600 dark:text-indigo-300'
                                                            : 'bg-slate-200/80 dark:bg-white/[.06] text-slate-500 dark:text-slate-400'
                                                        }`}>
                                                        {nlpPrompts.length}
                                                    </span>
                                                )}
                                            </button>

                                            {/* Expanded Prompts */}
                                            {isExpanded && nlpPrompts.length > 0 && (
                                                <div className="ml-5 mr-1 mb-1 border-l-2 border-indigo-500/15 dark:border-indigo-500/10">
                                                    {nlpPrompts.map((prompt, idx) => (
                                                        <div
                                                            key={prompt.id}
                                                            className="pl-3 py-1.5 text-[11px] text-slate-500 dark:text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-300 cursor-pointer hover:bg-indigo-50/50 dark:hover:bg-indigo-500/[.03] rounded-r-md transition-colors duration-150 truncate"
                                                            onClick={() => selectPage(page.id)}
                                                            title={prompt.template}
                                                        >
                                                            <span className="text-indigo-400/60 dark:text-indigo-500/40 mr-1.5">{idx + 1}.</span>
                                                            {prompt.template.length > 60
                                                                ? prompt.template.substring(0, 60) + '...'
                                                                : prompt.template
                                                            }
                                                        </div>
                                                    ))}
                                                </div>
                                            )}

                                            {isExpanded && nlpPrompts.length === 0 && (
                                                <div className="ml-8 mr-1 mb-1 py-1.5 text-[10px] text-slate-400 dark:text-slate-500 italic">
                                                    No NLP prompts found
                                                </div>
                                            )}
                                        </div>
                                    )
                                })}
                            </div>
                        )}

                        {/* Code-Only Pages Section */}
                        {filteredCodePages.length > 0 && (
                            <div className="mb-2">
                                <div className="px-3 py-1.5 text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest">
                                    Code Files
                                </div>
                                {filteredCodePages.map(page => {
                                    const isSelected = selectedPageId === page.id
                                    return (
                                        <div key={page.id} className="mx-1.5">
                                            <button
                                                onClick={() => selectPage(page.id)}
                                                className={`w-full flex items-center gap-2 px-2.5 py-2 rounded-lg text-left transition-all duration-150 ${isSelected
                                                        ? 'bg-indigo-500/10 dark:bg-indigo-500/[.08] text-indigo-700 dark:text-indigo-300'
                                                        : 'hover:bg-slate-100 dark:hover:bg-white/[.03] text-slate-600 dark:text-slate-400'
                                                    }`}
                                            >
                                                <svg className={`w-4 h-4 flex-shrink-0 ${isSelected ? 'text-indigo-500' : 'text-blue-500'}`} fill="currentColor" viewBox="0 0 20 20">
                                                    <path fillRule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4z" clipRule="evenodd" />
                                                </svg>
                                                <span className="text-xs font-medium truncate flex-1">{page.componentName}</span>
                                                <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-slate-200/60 dark:bg-white/[.04] text-slate-400 dark:text-slate-500 font-medium">
                                                    code
                                                </span>
                                            </button>
                                        </div>
                                    )
                                })}
                            </div>
                        )}

                        {/* Empty sidebar */}
                        {filteredPromptPages.length === 0 && filteredCodePages.length === 0 && (
                            <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
                                <div className="text-3xl mb-3 opacity-40">📭</div>
                                <p className="text-xs text-slate-400 dark:text-slate-500">
                                    {searchQuery ? 'No matching pages' : 'No pages found. Click Sync to scan your project.'}
                                </p>
                            </div>
                        )}
                    </div>

                    {/* Sidebar Footer Stats */}
                    <div className="px-3 py-2 border-t border-slate-200/60 dark:border-white/[.04] flex items-center justify-between text-[10px] text-slate-400 dark:text-slate-500">
                        <span>{promptPages.length} pages</span>
                        <span>{pages.reduce((sum, p) => sum + (p.sections?.length || 0), 0)} sections</span>
                        <span>{pages.reduce((sum, p) => sum + p.totalLines, 0).toLocaleString()} LOC</span>
                    </div>
                </aside>

                {/* Resize Handle */}
                <div
                    className="w-1 cursor-col-resize bg-transparent hover:bg-indigo-500/20 active:bg-indigo-500/30 transition-colors duration-150 flex-shrink-0 z-10"
                    onMouseDown={handleMouseDown}
                    title="Drag to resize sidebar"
                />

                {/* ====== CENTER CONTENT ====== */}
                <main className="flex-1 overflow-hidden flex flex-col min-w-0">
                    {selectedPage ? (
                        <>
                            {/* Content Header */}
                            <div className="px-4 py-2.5 border-b border-slate-200/60 dark:border-white/[.04] bg-white/40 dark:bg-white/[.01] flex items-center justify-between flex-shrink-0">
                                <div className="flex items-center gap-2.5 min-w-0">
                                    <svg className="w-4 h-4 text-amber-500 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                                        <path fillRule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4z" clipRule="evenodd" />
                                    </svg>
                                    <div className="min-w-0">
                                        <h2 className="text-sm font-bold text-slate-700 dark:text-slate-200 truncate">
                                            {selectedPage.componentName}
                                        </h2>
                                        <p className="text-[10px] text-slate-400 dark:text-slate-500 truncate">
                                            {selectedPage.filePath}
                                        </p>
                                    </div>
                                </div>
                                <div className="flex items-center gap-2 flex-shrink-0">
                                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 font-semibold">
                                        {selectedPage.totalLines} lines
                                    </span>
                                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${selectedPage.promptFilePath
                                            ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                                            : 'bg-slate-200/80 dark:bg-white/[.06] text-slate-500'
                                        }`}>
                                        {selectedPage.promptFilePath ? '✦ Has Prompt' : 'Code Only'}
                                    </span>
                                    {/* Open full detail */}
                                    <button
                                        onClick={() => router.push(`/prompt/${selectedPage.id}`)}
                                        className="w-7 h-7 flex items-center justify-center rounded-md text-slate-400 hover:text-indigo-500 hover:bg-indigo-500/10 transition-all duration-200"
                                        title="Open full detail page"
                                    >
                                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                            <path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6" />
                                            <polyline points="15 3 21 3 21 9" />
                                            <line x1="10" y1="14" x2="21" y2="3" />
                                        </svg>
                                    </button>
                                </div>
                            </div>

                            {/* File Content */}
                            <div className="flex-1 overflow-auto p-4">
                                <div className="bg-white dark:bg-[#0d0d1a]/80 rounded-xl border border-slate-200/80 dark:border-white/[.06] shadow-sm overflow-hidden">
                                    {/* Content toolbar */}
                                    <div className="flex items-center justify-between px-4 py-2 border-b border-slate-200/60 dark:border-white/[.04] bg-slate-50 dark:bg-white/[.02]">
                                        <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">
                                            {selectedPage.promptFilePath ? 'Prompt Content' : 'Source Code'}
                                        </span>
                                        <button
                                            className="text-[10px] text-indigo-500 hover:text-indigo-600 dark:text-indigo-400 dark:hover:text-indigo-300 font-medium transition-colors"
                                            onClick={() => {
                                                if (selectedPage.rawContent) {
                                                    navigator.clipboard.writeText(selectedPage.rawContent)
                                                }
                                            }}
                                        >
                                            Copy
                                        </button>
                                    </div>
                                    {/* Actual content */}
                                    <pre className="p-4 text-xs leading-relaxed text-slate-700 dark:text-slate-300 whitespace-pre-wrap break-words font-mono overflow-auto max-h-[calc(100vh-220px)]">
                                        {selectedPage.rawContent || 'No content available for this file.'}
                                    </pre>
                                </div>
                            </div>
                        </>
                    ) : (
                        /* ====== Welcome Screen ====== */
                        <div className="flex-1 flex items-center justify-center p-8">
                            <div className="text-center max-w-md">
                                {/* Decorative Icon */}
                                <div className="relative inline-block mb-6">
                                    <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-indigo-500/10 to-purple-500/10 dark:from-indigo-500/[.07] dark:to-purple-500/[.07] flex items-center justify-center border border-indigo-500/10 dark:border-indigo-500/[.06]">
                                        <svg className="w-10 h-10 text-indigo-500/60 dark:text-indigo-400/40" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                        </svg>
                                    </div>
                                    <div className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-indigo-500 animate-pulse" />
                                </div>

                                <h2 className="text-xl font-bold text-slate-700 dark:text-slate-200 mb-2">
                                    NLP Prompt Dashboard
                                </h2>
                                <p className="text-sm text-slate-400 dark:text-slate-500 mb-6">
                                    Select a page from the sidebar to view its prompt content and NLP instructions.
                                </p>

                                {/* Quick Stats */}
                                <div className="flex items-center justify-center gap-6">
                                    <div className="text-center">
                                        <div className="text-2xl font-bold bg-gradient-to-r from-indigo-500 to-purple-500 bg-clip-text text-transparent">
                                            {promptPages.length}
                                        </div>
                                        <div className="text-[10px] text-slate-400 dark:text-slate-500 uppercase tracking-widest font-medium">
                                            Pages
                                        </div>
                                    </div>
                                    <div className="w-px h-8 bg-slate-200 dark:bg-white/[.06]" />
                                    <div className="text-center">
                                        <div className="text-2xl font-bold bg-gradient-to-r from-amber-500 to-orange-500 bg-clip-text text-transparent">
                                            {pages.reduce((sum, p) => {
                                                return sum + p.sections.flatMap(s => s.prompts.filter(pr => pr.promptType === 'NLP')).length
                                            }, 0)}
                                        </div>
                                        <div className="text-[10px] text-slate-400 dark:text-slate-500 uppercase tracking-widest font-medium">
                                            NLP Prompts
                                        </div>
                                    </div>
                                    <div className="w-px h-8 bg-slate-200 dark:bg-white/[.06]" />
                                    <div className="text-center">
                                        <div className="text-2xl font-bold bg-gradient-to-r from-emerald-500 to-teal-500 bg-clip-text text-transparent">
                                            {pages.reduce((sum, p) => sum + p.totalLines, 0).toLocaleString()}
                                        </div>
                                        <div className="text-[10px] text-slate-400 dark:text-slate-500 uppercase tracking-widest font-medium">
                                            Total LOC
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}
                </main>
            </div>

            {/* ====== STATUS BAR ====== */}
            <div className="h-6 px-3 flex items-center justify-between border-t border-slate-200/60 dark:border-white/[.06] bg-indigo-600 dark:bg-indigo-900/80 text-white text-[10px] flex-shrink-0 z-30">
                <div className="flex items-center gap-3">
                    <span className="flex items-center gap-1">
                        <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                        Connected
                    </span>
                    {activeProject && (
                        <span className="opacity-70">📁 {activeProject.name}</span>
                    )}
                </div>
                <div className="flex items-center gap-3 opacity-70">
                    {selectedPage && (
                        <span>Ln {selectedPage.totalLines}</span>
                    )}
                    <span>NLP View</span>
                    <span>UTF-8</span>
                </div>
            </div>

            {/* Custom Scrollbar Styles */}
            <style jsx>{`
                .nlp-sidebar-scroll::-webkit-scrollbar {
                    width: 4px;
                }
                .nlp-sidebar-scroll::-webkit-scrollbar-track {
                    background: transparent;
                }
                .nlp-sidebar-scroll::-webkit-scrollbar-thumb {
                    background: rgba(100, 116, 139, 0.15);
                    border-radius: 999px;
                }
                .nlp-sidebar-scroll::-webkit-scrollbar-thumb:hover {
                    background: rgba(100, 116, 139, 0.3);
                }
                .animate-in {
                    animation: slideIn 0.3s ease-out;
                }
                @keyframes slideIn {
                    from { opacity: 0; transform: translateY(-8px); }
                    to { opacity: 1; transform: translateY(0); }
                }
            `}</style>
        </div>
    )
}
