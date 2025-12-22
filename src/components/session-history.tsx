"use client"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { ResearchSession } from "@/types"
import { History, Trash2, ExternalLink, Clock } from "lucide-react"

interface SessionHistoryProps {
  sessions: ResearchSession[]
  onLoadSession: (sessionId: string) => void
  onDeleteSession: (sessionId: string) => void
}

export function SessionHistory({ sessions, onLoadSession, onDeleteSession }: SessionHistoryProps) {
  if (sessions.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <History className="h-4 w-4" />
            Research History
          </CardTitle>
          <CardDescription>Your previous keyword research sessions</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="py-8 text-center text-gray-500">
            <History className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p>No research history yet</p>
            <p className="text-sm">Your completed sessions will appear here</p>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <History className="h-4 w-4" />
          Research History
        </CardTitle>
        <CardDescription>{sessions.length} previous sessions</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-3 max-h-[400px] overflow-y-auto pr-2">
          {sessions.map((session) => (
            <div
              key={session.id}
              className="p-3 border border-gray-100 rounded-lg hover:bg-gray-50 transition-colors group"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <h4 className="font-medium text-gray-900 truncate">
                    {session.courseInput.courseName}
                  </h4>
                  <div className="flex items-center gap-2 mt-1">
                    <Badge variant="secondary" className="text-xs">
                      {session.analyzedKeywords.length} keywords
                    </Badge>
                    {session.courseInput.primaryVendor && (
                      <Badge variant="outline" className="text-xs">
                        {session.courseInput.primaryVendor}
                      </Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-1 mt-2 text-xs text-gray-400">
                    <Clock className="h-3 w-3" />
                    {new Date(session.createdAt).toLocaleDateString()} at{' '}
                    {new Date(session.createdAt).toLocaleTimeString()}
                  </div>
                </div>
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => onLoadSession(session.id)}
                  >
                    <ExternalLink className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-red-500 hover:text-red-600 hover:bg-red-50"
                    onClick={() => onDeleteSession(session.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}
