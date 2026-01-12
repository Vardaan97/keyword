import { NextResponse } from 'next/server'
import { promises as fs } from 'fs'
import path from 'path'

export const dynamic = 'force-dynamic'

/**
 * Debug Logs Endpoint
 *
 * GET /api/debug/logs - Get recent logs
 * GET /api/debug/logs?clear=true - Clear logs
 * GET /api/debug/logs?lines=50 - Get specific number of lines
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const clear = searchParams.get('clear') === 'true'
  const lines = parseInt(searchParams.get('lines') || '100', 10)

  const logFilePath = path.join(process.cwd(), 'app.log')

  try {
    if (clear) {
      await fs.writeFile(logFilePath, '', 'utf-8')
      return NextResponse.json({ success: true, message: 'Logs cleared' })
    }

    // Try to read the log file
    let logContent = ''
    try {
      logContent = await fs.readFile(logFilePath, 'utf-8')
    } catch {
      // File doesn't exist
      logContent = ''
    }

    const allLines = logContent.split('\n').filter(Boolean)
    const recentLines = allLines.slice(-lines)

    // Parse JSON logs if possible
    const parsedLogs = recentLines.map(line => {
      try {
        return JSON.parse(line)
      } catch {
        return { raw: line }
      }
    })

    return NextResponse.json({
      success: true,
      totalLines: allLines.length,
      returnedLines: recentLines.length,
      logs: parsedLogs
    })
  } catch (error) {
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to read logs'
    }, { status: 500 })
  }
}
