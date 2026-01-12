/**
 * Centralized Logging Utility
 *
 * Provides structured logging with:
 * - Console output with colors and timestamps
 * - File logging for persistence
 * - Log levels (debug, info, warn, error)
 * - Context/metadata support
 * - Easy integration with external services (Axiom, etc.)
 */

import { promises as fs } from 'fs'
import path from 'path'

// Log levels
type LogLevel = 'debug' | 'info' | 'warn' | 'error'

// Log entry structure
interface LogEntry {
  timestamp: string
  level: LogLevel
  component: string
  message: string
  data?: Record<string, unknown>
  error?: {
    message: string
    stack?: string
    code?: string
  }
}

// Log file path
const LOG_FILE_PATH = path.join(process.cwd(), 'app.log')
const LOG_LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3
}

// Current log level (can be set via env var)
const CURRENT_LOG_LEVEL: LogLevel = (process.env.LOG_LEVEL as LogLevel) || 'debug'

// ANSI color codes for console
const COLORS = {
  reset: '\x1b[0m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  green: '\x1b[32m',
  magenta: '\x1b[35m'
}

// Format timestamp
function getTimestamp(): string {
  return new Date().toISOString()
}

// Format log entry for console
function formatConsole(entry: LogEntry): string {
  const levelColors: Record<LogLevel, string> = {
    debug: COLORS.dim,
    info: COLORS.cyan,
    warn: COLORS.yellow,
    error: COLORS.red
  }

  const color = levelColors[entry.level]
  const levelStr = entry.level.toUpperCase().padEnd(5)

  let output = `${COLORS.dim}${entry.timestamp}${COLORS.reset} `
  output += `${color}[${levelStr}]${COLORS.reset} `
  output += `${COLORS.magenta}[${entry.component}]${COLORS.reset} `
  output += entry.message

  if (entry.data && Object.keys(entry.data).length > 0) {
    output += `\n${COLORS.dim}  Data: ${JSON.stringify(entry.data, null, 2)}${COLORS.reset}`
  }

  if (entry.error) {
    output += `\n${COLORS.red}  Error: ${entry.error.message}${COLORS.reset}`
    if (entry.error.stack) {
      output += `\n${COLORS.dim}  Stack: ${entry.error.stack}${COLORS.reset}`
    }
  }

  return output
}

// Format log entry for file
function formatFile(entry: LogEntry): string {
  return JSON.stringify(entry)
}

// Write to log file (non-blocking)
async function writeToFile(entry: LogEntry): Promise<void> {
  try {
    const line = formatFile(entry) + '\n'
    await fs.appendFile(LOG_FILE_PATH, line, 'utf-8')
  } catch (error) {
    // Silently fail file logging - don't break the app
    console.error('Failed to write to log file:', error)
  }
}

// Check if should log based on level
function shouldLog(level: LogLevel): boolean {
  return LOG_LEVEL_PRIORITY[level] >= LOG_LEVEL_PRIORITY[CURRENT_LOG_LEVEL]
}

// Main log function
function log(
  level: LogLevel,
  component: string,
  message: string,
  data?: Record<string, unknown>,
  error?: Error
): void {
  if (!shouldLog(level)) return

  const entry: LogEntry = {
    timestamp: getTimestamp(),
    level,
    component,
    message,
    data,
    error: error ? {
      message: error.message,
      stack: error.stack,
      code: (error as NodeJS.ErrnoException).code
    } : undefined
  }

  // Console output
  console.log(formatConsole(entry))

  // File output (async, non-blocking)
  writeToFile(entry).catch(() => {})
}

// Create a logger for a specific component
export function createLogger(component: string) {
  return {
    debug: (message: string, data?: Record<string, unknown>) =>
      log('debug', component, message, data),

    info: (message: string, data?: Record<string, unknown>) =>
      log('info', component, message, data),

    warn: (message: string, data?: Record<string, unknown>) =>
      log('warn', component, message, data),

    error: (message: string, error?: Error, data?: Record<string, unknown>) =>
      log('error', component, message, data, error),

    // Log API request/response
    apiRequest: (method: string, url: string, body?: unknown) => {
      log('debug', component, `API Request: ${method} ${url}`, {
        method,
        url,
        body: body ? JSON.stringify(body).substring(0, 500) : undefined
      })
    },

    apiResponse: (url: string, status: number, data?: unknown, duration?: number) => {
      const level: LogLevel = status >= 400 ? 'error' : 'info'
      log(level, component, `API Response: ${status} ${url}`, {
        url,
        status,
        duration: duration ? `${duration}ms` : undefined,
        data: data ? JSON.stringify(data).substring(0, 1000) : undefined
      })
    },

    // Log with timing
    startTimer: (label: string) => {
      const start = Date.now()
      return {
        end: (message?: string, data?: Record<string, unknown>) => {
          const duration = Date.now() - start
          log('info', component, message || `${label} completed`, {
            ...data,
            duration: `${duration}ms`,
            label
          })
          return duration
        }
      }
    }
  }
}

// Export default logger
export const logger = createLogger('APP')

// Export a function to read recent logs
export async function getRecentLogs(lines: number = 100): Promise<string[]> {
  try {
    const content = await fs.readFile(LOG_FILE_PATH, 'utf-8')
    const allLines = content.split('\n').filter(Boolean)
    return allLines.slice(-lines)
  } catch {
    return []
  }
}

// Export a function to clear logs
export async function clearLogs(): Promise<void> {
  try {
    await fs.writeFile(LOG_FILE_PATH, '', 'utf-8')
  } catch {
    // Ignore
  }
}
