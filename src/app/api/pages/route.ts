import { prisma } from '@/lib/prisma'
import { NextResponse } from 'next/server'

// GET all pages with their data
export async function GET() {
    try {
        const pages = await prisma.page.findMany({
            include: {
                sections: {
                    include: {
                        prompts: true
                    }
                },
                stateVars: true,
                functions: true
            }
        })

        const masterPrompts = await prisma.masterPrompt.findMany()

        return NextResponse.json({ pages, masterPrompts })
    } catch (error) {
        console.error('Error fetching pages:', error)
        return NextResponse.json({ error: 'Failed to fetch pages' }, { status: 500 })
    }
}
