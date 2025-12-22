"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { PromptConfig } from "@/types"
import { Pencil, RotateCcw, Save, Sparkles } from "lucide-react"

interface PromptEditorProps {
  prompt: PromptConfig
  onSave: (prompt: PromptConfig) => void
  onReset?: () => void
  defaultPrompt?: PromptConfig
}

export function PromptEditor({ prompt, onSave, onReset, defaultPrompt }: PromptEditorProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [editedPrompt, setEditedPrompt] = useState(prompt)

  const handleSave = () => {
    onSave({
      ...editedPrompt,
      lastUpdated: new Date().toISOString()
    })
    setIsOpen(false)
  }

  const handleReset = () => {
    if (defaultPrompt) {
      setEditedPrompt(defaultPrompt)
    }
    if (onReset) {
      onReset()
    }
  }

  const handleOpenChange = (open: boolean) => {
    setIsOpen(open)
    if (open) {
      setEditedPrompt(prompt)
    }
  }

  return (
    <Card className="group hover:shadow-md transition-shadow">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="space-y-1">
            <CardTitle className="text-base flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-blue-500" />
              {prompt.name}
            </CardTitle>
            <CardDescription className="text-xs">
              {prompt.description}
            </CardDescription>
          </div>
          <Dialog open={isOpen} onOpenChange={handleOpenChange}>
            <DialogTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity">
                <Pencil className="h-4 w-4" />
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Edit Prompt: {prompt.name}</DialogTitle>
                <DialogDescription>
                  Customize the AI prompt to match your specific requirements.
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label htmlFor="prompt-name">Prompt Name</Label>
                  <Input
                    id="prompt-name"
                    value={editedPrompt.name}
                    onChange={(e) => setEditedPrompt({ ...editedPrompt, name: e.target.value })}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="prompt-description">Description</Label>
                  <Input
                    id="prompt-description"
                    value={editedPrompt.description}
                    onChange={(e) => setEditedPrompt({ ...editedPrompt, description: e.target.value })}
                  />
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="prompt-content">Prompt Content</Label>
                    <div className="flex gap-1">
                      {editedPrompt.variables.map((variable) => (
                        <Badge key={variable} variant="secondary" className="text-xs">
                          {`{{${variable}}}`}
                        </Badge>
                      ))}
                    </div>
                  </div>
                  <Textarea
                    id="prompt-content"
                    value={editedPrompt.prompt}
                    onChange={(e) => setEditedPrompt({ ...editedPrompt, prompt: e.target.value })}
                    className="min-h-[400px] font-mono text-sm"
                    placeholder="Enter your prompt here..."
                  />
                  <p className="text-xs text-gray-500">
                    Use double curly braces for variables: {`{{VARIABLE_NAME}}`}
                  </p>
                </div>
              </div>

              <DialogFooter className="gap-2">
                {defaultPrompt && (
                  <Button variant="outline" onClick={handleReset} className="mr-auto">
                    <RotateCcw className="h-4 w-4 mr-2" />
                    Reset to Default
                  </Button>
                )}
                <Button variant="outline" onClick={() => setIsOpen(false)}>
                  Cancel
                </Button>
                <Button onClick={handleSave}>
                  <Save className="h-4 w-4 mr-2" />
                  Save Changes
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </CardHeader>
      <CardContent>
        <div className="flex flex-wrap gap-1.5">
          <span className="text-xs text-gray-500">Variables:</span>
          {prompt.variables.map((variable) => (
            <Badge key={variable} variant="outline" className="text-xs">
              {variable}
            </Badge>
          ))}
        </div>
        <p className="text-xs text-gray-400 mt-2">
          Last updated: {new Date(prompt.lastUpdated).toLocaleDateString()}
        </p>
      </CardContent>
    </Card>
  )
}
