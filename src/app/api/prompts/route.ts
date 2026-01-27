import { prisma } from '@/lib/prisma'
import { NextRequest, NextResponse } from 'next/server'

// GET prompts for a specific section
export async function GET(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url)
        const pageId = searchParams.get('pageId')
        const sectionName = searchParams.get('section')

        let whereClause = {}

        if (pageId && sectionName) {
            whereClause = {
                section: {
                    pageId: pageId,
                    name: sectionName
                }
            }
        } else if (sectionName) {
            whereClause = {
                section: {
                    name: sectionName
                }
            }
        }

        const prompts = await prisma.prompt.findMany({
            where: whereClause,
            include: {
                section: {
                    include: {
                        page: {
                            select: {
                                filePath: true,
                                componentName: true
                            }
                        }
                    }
                }
            }
        })

        return NextResponse.json({ prompts })
    } catch (error) {
        console.error('Error fetching prompts:', error)
        return NextResponse.json({ error: 'Failed to fetch prompts' }, { status: 500 })
    }
}
