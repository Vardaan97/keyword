"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { CourseInput } from "@/types"
import { Search, Globe, Building2, FileText } from "lucide-react"

interface CourseInputFormProps {
  onSubmit: (input: CourseInput) => void
  isLoading?: boolean
}

const VENDORS = [
  "Microsoft",
  "AWS",
  "Google Cloud",
  "Cisco",
  "Oracle",
  "VMware",
  "Red Hat",
  "CompTIA",
  "ITIL",
  "PMP",
  "Scrum",
  "PECB",
  "EC-Council",
  "SAP",
  "Salesforce",
  "Other"
]

const GEO_TARGETS = [
  { value: "india", label: "India" },
  { value: "usa", label: "USA" },
  { value: "uk", label: "UK" },
  { value: "uae", label: "UAE" },
  { value: "singapore", label: "Singapore" },
  { value: "australia", label: "Australia" },
  { value: "canada", label: "Canada" },
  { value: "germany", label: "Germany" },
  { value: "malaysia", label: "Malaysia" },
  { value: "saudi", label: "Saudi Arabia" },
  { value: "global", label: "Global" }
]

export function CourseInputForm({ onSubmit, isLoading }: CourseInputFormProps) {
  const [formData, setFormData] = useState<CourseInput>({
    courseName: "",
    courseUrl: "",
    certificationCode: "",
    primaryVendor: "",
    relatedTerms: [],
    targetGeography: "india"
  })

  const [relatedTermsInput, setRelatedTermsInput] = useState("")

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!formData.courseName || !formData.courseUrl) return

    onSubmit({
      ...formData,
      relatedTerms: relatedTermsInput
        .split(",")
        .map((t) => t.trim())
        .filter((t) => t.length > 0)
    })
  }

  return (
    <Card className="border-2 border-dashed border-blue-200 bg-gradient-to-br from-blue-50/50 to-indigo-50/50">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Search className="h-5 w-5 text-blue-600" />
          Keyword Research Input
        </CardTitle>
        <CardDescription>
          Enter your course details to generate targeted keywords
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            {/* Course Name */}
            <div className="space-y-2">
              <Label htmlFor="courseName" className="flex items-center gap-1.5">
                <FileText className="h-3.5 w-3.5" />
                Course Name <span className="text-red-500">*</span>
              </Label>
              <Input
                id="courseName"
                placeholder="e.g., Power BI Data Analyst"
                value={formData.courseName}
                onChange={(e) => setFormData({ ...formData, courseName: e.target.value })}
                required
              />
            </div>

            {/* Course URL */}
            <div className="space-y-2">
              <Label htmlFor="courseUrl" className="flex items-center gap-1.5">
                <Globe className="h-3.5 w-3.5" />
                Course URL <span className="text-red-500">*</span>
              </Label>
              <Input
                id="courseUrl"
                type="url"
                placeholder="https://kfrgroup.com/course/..."
                value={formData.courseUrl}
                onChange={(e) => setFormData({ ...formData, courseUrl: e.target.value })}
                required
              />
            </div>

            {/* Certification Code */}
            <div className="space-y-2">
              <Label htmlFor="certificationCode">Certification Code</Label>
              <Input
                id="certificationCode"
                placeholder="e.g., PL-300, AZ-104"
                value={formData.certificationCode}
                onChange={(e) => setFormData({ ...formData, certificationCode: e.target.value })}
              />
            </div>

            {/* Primary Vendor */}
            <div className="space-y-2">
              <Label htmlFor="primaryVendor" className="flex items-center gap-1.5">
                <Building2 className="h-3.5 w-3.5" />
                Primary Vendor
              </Label>
              <Select
                value={formData.primaryVendor}
                onValueChange={(value) => setFormData({ ...formData, primaryVendor: value })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select vendor" />
                </SelectTrigger>
                <SelectContent>
                  {VENDORS.map((vendor) => (
                    <SelectItem key={vendor} value={vendor}>
                      {vendor}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Related Terms */}
            <div className="space-y-2">
              <Label htmlFor="relatedTerms">Related Terms (comma-separated)</Label>
              <Input
                id="relatedTerms"
                placeholder="e.g., Power BI, DAX, Power Query"
                value={relatedTermsInput}
                onChange={(e) => setRelatedTermsInput(e.target.value)}
              />
            </div>

            {/* Target Geography */}
            <div className="space-y-2">
              <Label htmlFor="targetGeography">Target Geography</Label>
              <Select
                value={formData.targetGeography}
                onValueChange={(value) => setFormData({ ...formData, targetGeography: value })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select geography" />
                </SelectTrigger>
                <SelectContent>
                  {GEO_TARGETS.map((geo) => (
                    <SelectItem key={geo.value} value={geo.value}>
                      {geo.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <Button type="submit" className="w-full" size="lg" disabled={isLoading}>
            {isLoading ? (
              <>
                <span className="animate-spin mr-2">⏳</span>
                Researching Keywords...
              </>
            ) : (
              <>
                <Search className="h-4 w-4 mr-2" />
                Start Keyword Research
              </>
            )}
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}
