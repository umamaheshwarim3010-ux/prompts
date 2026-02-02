'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
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
        <div className={`glass-card rounded-xl sm:rounded-2xl overflow-hidden transition-all duration-300 ${isExpanded ? 'ring-2 ring-indigo-500/50' : 'hover:ring-1 hover:ring-white/20'}`}>
            {/* Folder Header - Clickable */}
            <button
                onClick={onToggle}
                className="w-full p-4 sm:p-6 lg:p-8 text-left bg-gradient-to-br from-slate-800/50 to-slate-900/50 hover:from-slate-700/50 hover:to-slate-800/50 active:from-slate-700/60 active:to-slate-800/60 transition-all"
            >
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                    <div className="flex items-center gap-3 sm:gap-5">
                        <div className="w-12 h-12 sm:w-14 lg:w-16 sm:h-14 lg:h-16 rounded-xl sm:rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shadow-lg shadow-indigo-500/20 flex-shrink-0">
                            <span className="text-xl sm:text-2xl lg:text-3xl">{isExpanded ? '📂' : '📁'}</span>
                        </div>
                        <div className="min-w-0">
                            <h2 className="text-lg sm:text-xl lg:text-2xl font-bold text-white mb-0.5 sm:mb-1 truncate">{getDisplayName(folderName)}</h2>
                            <p className="text-xs sm:text-sm text-slate-400 font-mono truncate">{folderName}</p>
                        </div>
                    </div>

                    <div className="flex items-center justify-between sm:justify-end gap-3 sm:gap-4">
                        {/* Stats - Fixed alignment with min-width */}
                        <div className="flex gap-4 sm:gap-6">
                            <div className="min-w-[40px] sm:min-w-[60px] text-center">
                                <div className="text-base sm:text-lg lg:text-xl font-bold text-indigo-400">{pages.length}</div>
                                <div className="text-[10px] sm:text-xs text-slate-500 uppercase tracking-wide">Files</div>
                            </div>
                            <div className="min-w-[50px] sm:min-w-[70px] text-center">
                                <div className="text-base sm:text-lg lg:text-xl font-bold text-emerald-400">{totalLines.toLocaleString()}</div>
                                <div className="text-[10px] sm:text-xs text-slate-500 uppercase tracking-wide">LOC</div>
                            </div>
                            <div className="hidden xs:block min-w-[50px] sm:min-w-[70px] text-center">
                                <div className="text-base sm:text-lg lg:text-xl font-bold text-amber-400">{totalSections}</div>
                                <div className="text-[10px] sm:text-xs text-slate-500 uppercase tracking-wide">Sections</div>
                            </div>
                            <div className="hidden sm:block min-w-[70px] text-center">
                                <div className="text-xl font-bold text-pink-400">{totalPrompts}</div>
                                <div className="text-xs text-slate-500 uppercase tracking-wide">Prompts</div>
                            </div>
                        </div>

                        {/* Toggle Icon */}
                        <div className={`text-lg sm:text-xl lg:text-2xl text-slate-400 transition-transform duration-300 ml-1 sm:ml-2 ${isExpanded ? 'rotate-180' : ''}`}>
                            ▼
                        </div>
                    </div>
                </div>
            </button>


            {/* Files List - Expandable */}
            {isExpanded && (
                <div className="border-t border-white/10 bg-black/30">
                    <div className="p-2 sm:p-4 space-y-1 sm:space-y-2">
                        {pages.map((page) => (
                            <button
                                key={page.id}
                                onClick={() => onSelectFile(page)}
                                className="w-full flex items-center justify-between p-3 sm:p-4 rounded-lg sm:rounded-xl bg-slate-900/50 hover:bg-slate-800/70 active:bg-slate-800/90 border border-white/5 hover:border-indigo-500/30 transition-all group"
                            >
                                <div className="flex items-center gap-2 sm:gap-4 min-w-0">
                                    <span className="text-lg sm:text-xl flex-shrink-0">📄</span>
                                    <div className="text-left min-w-0">
                                        <div className="font-semibold text-sm sm:text-base text-white group-hover:text-indigo-300 transition-colors truncate">
                                            {page.componentName}
                                        </div>
                                        <div className="text-[10px] sm:text-xs text-slate-500 font-mono truncate">
                                            {page.filePath.split('/').pop()}
                                        </div>
                                    </div>
                                </div>
                                <div className="flex items-center gap-2 sm:gap-4 flex-shrink-0">
                                    <div className="min-w-[35px] sm:min-w-[50px] text-center">
                                        <div className="text-xs sm:text-sm font-bold text-indigo-400">{page.totalLines}</div>
                                        <div className="text-[9px] sm:text-[10px] text-slate-500 uppercase">LOC</div>
                                    </div>
                                    <div className="hidden xs:block min-w-[45px] sm:min-w-[55px] text-center">
                                        <div className="text-xs sm:text-sm font-bold text-emerald-400">{page.sections.length}</div>
                                        <div className="text-[9px] sm:text-[10px] text-slate-500 uppercase">Sections</div>
                                    </div>
                                    <div className="hidden sm:block min-w-[55px] text-center">
                                        <div className="text-sm font-bold text-pink-400">{page.sections.reduce((s, sec) => s + sec.prompts.length, 0)}</div>
                                        <div className="text-[10px] text-slate-500 uppercase">Prompts</div>
                                    </div>
                                    <span className="text-slate-500 group-hover:text-indigo-400 transition-colors ml-1 sm:ml-2">→</span>
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
            <div className="w-full max-w-6xl max-h-[95vh] sm:max-h-[90vh] overflow-hidden rounded-2xl sm:rounded-3xl glass-card border border-white/10 flex flex-col my-2 sm:my-4">
                {/* Header */}
                <div className="p-4 sm:p-6 border-b border-white/10 bg-gradient-to-r from-slate-800/50 to-slate-900/50">
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4">
                        <div className="flex items-center gap-3 sm:gap-4 min-w-0">
                            <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-lg sm:rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center flex-shrink-0">
                                <span className="text-xl sm:text-2xl">📄</span>
                            </div>
                            <div className="min-w-0">
                                <h2 className="text-lg sm:text-xl lg:text-2xl font-bold text-white truncate">{page.componentName}</h2>
                                <p className="text-xs sm:text-sm text-slate-400 font-mono truncate">{page.filePath}</p>
                            </div>
                        </div>
                        <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
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
                                        <span className="hidden xs:inline">⬇️ </span>Download
                                    </button>
                                    <button
                                        onClick={() => setIsEditing(!isEditing)}
                                        className={`px-2 sm:px-3 py-1.5 sm:py-2 text-[10px] sm:text-xs rounded-lg border transition-colors ${isEditing ? 'bg-indigo-600 border-indigo-500' : 'bg-slate-800 hover:bg-slate-700 border-slate-600'}`}
                                    >
                                        ✏️ <span className="hidden xs:inline">{isEditing ? 'Editing' : 'Edit'}</span>
                                    </button>
                                </>
                            )}
                            <button
                                onClick={onClose}
                                className="w-8 h-8 sm:w-10 sm:h-10 flex items-center justify-center rounded-lg bg-slate-800 hover:bg-red-500/20 hover:text-red-400 transition-colors text-lg sm:text-xl"
                            >
                                ×
                            </button>
                        </div>
                    </div>

                    {/* Purpose */}
                    <p className="mt-3 sm:mt-4 text-sm sm:text-base text-slate-300 line-clamp-2">{page.purpose}</p>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-auto p-3 sm:p-4 lg:p-6 space-y-3 sm:space-y-4">
                    {/* Editor */}
                    {isEditing && page.rawContent && (
                        <div className="p-3 sm:p-4 bg-black/50 border border-slate-700 rounded-lg sm:rounded-xl">
                            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 mb-2">
                                <span className="text-[10px] sm:text-xs text-slate-400 font-mono truncate">Editing {page.componentName}.txt</span>
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
                                className="w-full h-[250px] sm:h-[350px] lg:h-[400px] bg-slate-900 text-slate-300 font-mono text-[10px] sm:text-xs p-3 sm:p-4 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/50 resize-y"
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
                            className="w-full bg-slate-900/50 border border-slate-700/50 rounded-lg sm:rounded-xl px-3 sm:px-4 py-2.5 sm:py-3 pl-8 sm:pl-10 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 text-xs sm:text-sm"
                        />
                        <span className="absolute left-2.5 sm:left-3 top-2.5 sm:top-3.5 text-slate-500 text-sm">🔍</span>
                    </div>

                    {/* Sections */}
                    {filteredSections.length > 0 ? (
                        <div className="space-y-2 sm:space-y-3">
                            {filteredSections.map(section => {
                                const isExpanded = expandedSections.has(section.id) || !!searchQuery

                                return (
                                    <div key={section.id} className="glass-panel rounded-lg sm:rounded-xl overflow-hidden border border-white/5 hover:border-indigo-500/30 transition-colors">
                                        <button
                                            onClick={() => toggleSection(section.id)}
                                            className="w-full flex items-center justify-between p-3 sm:p-4 bg-white/5 hover:bg-white/10 active:bg-white/15 transition-colors text-left"
                                        >
                                            <div className="flex items-center gap-2 sm:gap-4 min-w-0">
                                                <Badge color="blue">{section.name}</Badge>
                                                <span className="text-[10px] sm:text-xs font-mono text-slate-500 hidden xs:inline">L{section.startLine}-{section.endLine}</span>
                                            </div>
                                            <div className="text-slate-400 text-xs sm:text-sm flex items-center gap-2">
                                                <span className="hidden sm:inline text-xs opacity-50">{section.prompts.length} prompts</span>
                                                <span className={`transition-transform duration-300 ${isExpanded ? 'rotate-180' : ''}`}>▼</span>
                                            </div>
                                        </button>

                                        {isExpanded && (
                                            <div className="p-3 sm:p-4 bg-black/20 space-y-2 sm:space-y-3 border-t border-white/5">
                                                <p className="text-xs sm:text-sm text-slate-400 mb-3 sm:mb-4 italic border-l-2 border-indigo-500 pl-2 sm:pl-3">
                                                    {section.purpose}
                                                </p>

                                                <div className="grid gap-2 sm:gap-3">
                                                    {section.prompts.map(prompt => (
                                                        <div key={prompt.id} className="group relative bg-slate-900/60 rounded-lg p-3 sm:p-4 border border-white/5 hover:border-indigo-500/50 transition-all">
                                                            <div className="absolute right-2 top-2 flex items-center gap-1 sm:gap-2 sm:opacity-0 group-hover:opacity-100 transition-opacity">
                                                                <button
                                                                    onClick={(e) => {
                                                                        e.stopPropagation()
                                                                        scrollToLine(prompt.lineNumber || 1)
                                                                    }}
                                                                    className="text-[10px] sm:text-xs px-1.5 sm:px-2 py-0.5 sm:py-1 rounded bg-indigo-500/20 text-indigo-300 hover:bg-indigo-500/40 border border-indigo-500/30 transition-colors"
                                                                    title="Edit this prompt in the source file"
                                                                >
                                                                    ✏️ <span className="hidden xs:inline">Edit</span>
                                                                </button>
                                                                <CopyButton text={prompt.template} />
                                                            </div>
                                                            <div className="mb-2 pr-16 sm:pr-24">
                                                                <span className="text-[9px] sm:text-[10px] uppercase font-bold text-slate-600 tracking-wider flex items-center gap-1 sm:gap-2">
                                                                    Template
                                                                    <span className="text-slate-700 font-mono font-normal">Line {prompt.lineNumber}</span>
                                                                </span>
                                                                <div className="font-mono text-xs sm:text-sm text-indigo-300 mt-0.5 break-words">{prompt.template}</div>
                                                            </div>
                                                            {prompt.example && (
                                                                <div className="mt-2 pl-2 sm:pl-3 border-l-2 border-slate-700">
                                                                    <span className="text-[9px] sm:text-[10px] uppercase font-bold text-slate-600 tracking-wider">Example</span>
                                                                    <div className="text-[10px] sm:text-xs text-slate-400 mt-0.5 break-words">{prompt.example}</div>
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
                        <div className="glass-panel rounded-lg sm:rounded-xl p-8 sm:p-12 text-center text-slate-400">
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
    const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set())
    const [selectedPage, setSelectedPage] = useState<Page | null>(null)
    const [searchQuery, setSearchQuery] = useState('')

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

    const handleSave = async (pageId: string, content: string) => {
        try {
            const updatedPages = pages.map(p =>
                p.id === pageId ? { ...p, rawContent: content } : p
            )
            setPages(updatedPages)

            const saveResult = await apiRequest('/api/save', {
                method: 'POST',
                body: { pageId, content }
            })

            if (!saveResult.success) throw new Error('Save failed')

            await handleSeed()

            // Refresh selected page
            const pagesResult = await apiRequest<{ pages: Page[] }>('/api/pages')
            if (pagesResult.success && pagesResult.data?.pages) {
                setPages(pagesResult.data.pages)
                const updatedPage = pagesResult.data.pages.find((p: Page) => p.id === pageId)
                if (updatedPage) setSelectedPage(updatedPage)
            }
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
        <div className="min-h-screen text-slate-200 p-3 sm:p-4 md:p-6 lg:p-8 font-sans">
            {/* Navbar / Header */}
            <header className="max-w-7xl mx-auto mb-6 sm:mb-8 lg:mb-10 glass-panel rounded-xl sm:rounded-2xl p-4 sm:p-6">
                <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4 sm:gap-6">
                    <div className="flex items-center gap-3 sm:gap-4 min-w-0">
                        {/* Back Button */}
                        <button
                            onClick={() => router.push('/home')}
                            className="p-2 sm:p-2.5 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg sm:rounded-xl transition-all flex-shrink-0"
                            title="Back to Projects"
                        >
                            <svg className="w-4 h-4 sm:w-5 sm:h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                            </svg>
                        </button>
                        <div className="min-w-0">
                            <h1 className="text-xl sm:text-2xl lg:text-3xl font-extrabold bg-gradient-to-r from-indigo-400 to-purple-400 bg-clip-text text-transparent">
                                Agentic Prompt DB
                            </h1>
                            <p className="text-xs sm:text-sm lg:text-base text-slate-400 mt-0.5 sm:mt-1 truncate">Centralized Instruction Metadata for HR Assist</p>
                        </div>
                    </div>

                    <div className="flex flex-col xs:flex-row items-stretch xs:items-center gap-3 sm:gap-4 w-full lg:w-auto">
                        <div className="relative group flex-1 xs:flex-none">
                            <input
                                type="text"
                                placeholder="Search folders & files..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="bg-slate-900/50 border border-slate-700/50 rounded-lg sm:rounded-xl px-3 sm:px-4 py-2 pl-8 sm:pl-10 w-full xs:w-48 sm:w-64 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 text-xs sm:text-sm transition-all"
                            />
                            <span className="absolute left-2.5 sm:left-3 top-2 sm:top-2.5 text-slate-500 text-sm">🔍</span>
                        </div>

                        <button
                            onClick={handleSeed}
                            disabled={seeding}
                            className={`
              px-4 sm:px-6 py-2 rounded-lg sm:rounded-xl font-semibold text-xs sm:text-sm transition-all flex items-center justify-center gap-2
              ${seeding
                                    ? 'bg-slate-700 cursor-wait'
                                    : 'bg-indigo-600 hover:bg-indigo-500 shadow-lg shadow-indigo-600/20 active:scale-95'
                                }
            `}
                        >
                            {seeding ? 'Syncing...' : <><span className="hidden xs:inline">🔄</span> Sync All Prompts</>}
                        </button>
                    </div>
                </div>
            </header>

            <main className="max-w-7xl mx-auto space-y-4 sm:space-y-6">
                {/* Error State */}
                {error && (
                    <div className="bg-red-500/10 border border-red-500/20 rounded-xl sm:rounded-2xl p-4 sm:p-6 text-center animate-pulse-glow">
                        <p className="text-red-300 font-medium mb-3 sm:mb-4 text-sm sm:text-base">⚠️ {error}</p>
                        <button onClick={handleSeed} className="text-[10px] sm:text-xs px-3 sm:px-4 py-1.5 sm:py-2 rounded-lg bg-red-500/20 hover:bg-red-500/30 text-red-200 transition-colors">
                            Retry Seeding
                        </button>
                    </div>
                )}

                {/* Loading State */}
                {loading && !pages.length && (
                    <div className="flex justify-center py-16 sm:py-20">
                        <div className="w-10 h-10 sm:w-12 sm:h-12 border-4 border-indigo-500/30 border-t-indigo-500 rounded-full animate-spin"></div>
                    </div>
                )}

                {/* Empty State */}
                {!loading && !pages.length && !error && (
                    <div className="text-center py-16 sm:py-20 lg:py-24 glass-panel rounded-2xl sm:rounded-3xl px-4">
                        <div className="text-4xl sm:text-5xl lg:text-6xl mb-4 sm:mb-6 opacity-50">📭</div>
                        <h2 className="text-xl sm:text-2xl font-bold text-slate-300 mb-3 sm:mb-4">Database is Empty</h2>
                        <p className="text-sm sm:text-base text-slate-500 max-w-md mx-auto mb-6 sm:mb-8">
                            The metadata database has not been populated yet. Click the seed button to import prompts from your codebase.
                        </p>
                        <button onClick={handleSeed} className="px-6 sm:px-8 py-2.5 sm:py-3 bg-indigo-600 hover:bg-indigo-500 rounded-lg sm:rounded-xl font-bold text-sm sm:text-base shadow-lg shadow-indigo-500/25 transition-all">
                            Initialize Database
                        </button>
                    </div>
                )}

                {/* Folder Grid */}
                {filteredFolders.length > 0 && (
                    <div className="space-y-4 sm:space-y-6">
                        {/* Stats Overview */}
                        <div className="grid grid-cols-3 gap-2 sm:gap-4">
                            <div className="glass-panel rounded-lg sm:rounded-xl p-3 sm:p-4 lg:p-6 text-center">
                                <div className="text-xl sm:text-2xl lg:text-3xl font-bold text-indigo-400">{Object.keys(groupedPages).length}</div>
                                <div className="text-[10px] sm:text-xs lg:text-sm text-slate-500 uppercase tracking-wide">Folders</div>
                            </div>
                            <div className="glass-panel rounded-lg sm:rounded-xl p-3 sm:p-4 lg:p-6 text-center">
                                <div className="text-xl sm:text-2xl lg:text-3xl font-bold text-emerald-400">{pages.length}</div>
                                <div className="text-[10px] sm:text-xs lg:text-sm text-slate-500 uppercase tracking-wide">Files</div>
                            </div>
                            <div className="glass-panel rounded-lg sm:rounded-xl p-3 sm:p-4 lg:p-6 text-center">
                                <div className="text-xl sm:text-2xl lg:text-3xl font-bold text-amber-400">{pages.reduce((sum, p) => sum + p.totalLines, 0).toLocaleString()}</div>
                                <div className="text-[10px] sm:text-xs lg:text-sm text-slate-500 uppercase tracking-wide">Total LOC</div>
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
