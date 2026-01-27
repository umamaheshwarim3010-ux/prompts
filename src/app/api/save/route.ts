import { prisma } from '@/lib/prisma'
import { NextResponse } from 'next/server'
import fs from 'fs'
import path from 'path'

export async function POST(req: Request) {
    try {
        const body = await req.json()
        const { pageId, content } = body

        if (!pageId || content === undefined) {
            return NextResponse.json({ error: 'Missing pageId or content' }, { status: 400 })
        }

        const page = await prisma.page.findUnique({
            where: { id: pageId },
            select: { promptFilePath: true }
        })

        if (!page) {
            return NextResponse.json({ error: 'Page not found' }, { status: 404 })
        }

        if (!page.promptFilePath) {
            return NextResponse.json({ error: 'No prompt file path linked' }, { status: 400 })
        }

        // Write to file
        fs.writeFileSync(page.promptFilePath, content, 'utf-8')

        // Update rawContent in DB
        await prisma.page.update({
            where: { id: pageId },
            data: { rawContent: content }
        })

        return NextResponse.json({ success: true })
    } catch (error) {
        console.error('Save error:', error)
        return NextResponse.json({ error: 'Failed to save prompt' }, { status: 500 })
    }
}
