// Ad Creative Generation Types

// ============================================
// Platform & Size Types
// ============================================

export interface PlatformSize {
  id: string
  platform: 'google_pmax' | 'linkedin' | 'facebook' | 'display'
  name: string
  width: number
  height: number
  aspectRatio: string
  required: boolean
}

// ============================================
// Template Types
// ============================================

export interface TemplateLayer {
  id: string
  type: 'text' | 'image' | 'shape'
  name: string
  defaultValue?: string
  position: { x: number; y: number; width: number; height: number }
  style?: Record<string, string | number>
}

export interface TemplateDefinition {
  id: string
  name: string
  description: string
  category: 'dark' | 'light' | 'gradient' | 'cobrand' | 'urgency'
  placidTemplateUuids: Record<string, string> // sizeId -> placid template UUID
  layers: TemplateLayer[]
  supportedSizes: string[] // PlatformSize ids
  previewUrl?: string
  previewColor: string // hex for card background
}

export interface TemplateProps {
  courseName: string
  courseCode?: string
  vendor: string
  vendorLogo?: string
  topics?: string[]
  cta: string
  ctaUrl?: string
  koenigLogo?: string
  accentColor?: string
  backgroundImage?: string
  customTagline?: string
}

// ============================================
// Brand & Vendor Types
// ============================================

export interface VendorBrand {
  id: string
  displayName: string
  logoPath: string
  logoWhitePath?: string
  primaryColor: string
  secondaryColor: string
  domain?: string // for Clearbit fallback
}

// ============================================
// Generated Creative Types
// ============================================

export interface GeneratedCreative {
  id: string
  courseIndex: number
  courseName: string
  courseSlug: string
  templateId: string
  templateName: string
  sizeId: string
  sizeName: string
  width: number
  height: number
  imageUrl?: string
  imageBase64?: string
  placidImageId?: string
  metadata: {
    vendor: string
    cta: string
    generatedAt: string
    renderTimeMs?: number
  }
}

export interface CreativeBatch {
  id: string
  status: 'pending' | 'rendering' | 'completed' | 'error'
  templateIds: string[]
  sizeIds: string[]
  totalImages: number
  completedImages: number
  creatives: GeneratedCreative[]
  errors: { courseIndex: number; error: string }[]
  startTime: number
  endTime?: number
}

// ============================================
// AI Copy Types
// ============================================

export interface GeneratedAdCopy {
  headline: string       // max 30 chars
  longHeadline: string   // max 90 chars
  description: string    // max 90 chars
  cta: string
}

export interface CourseAdCopy {
  courseIndex: number
  courseName: string
  copies: GeneratedAdCopy[]
  isEdited: boolean
}

// ============================================
// Style Reference Types
// ============================================

export interface StyleReference {
  id: string
  name: string
  imageBase64: string
  uploadedAt: string
  tags: string[]
  width?: number
  height?: number
}

// ============================================
// Course Knowledge Base Types
// ============================================

export interface CreativeCourse {
  id: string
  courseName: string
  courseUrl?: string
  vendor: string
  courseCode?: string
  topicsCovered: string[]
  prerequisites: string[]
  targetAudience?: string
  usps: string[]
  duration?: string
  certificationDetails?: string
  category: CourseCategory
  technology?: string
  tocUrl?: string
  summary?: string
  updatedAt: string
}

export type CourseCategory =
  | 'Cloud'
  | 'Data'
  | 'Security'
  | 'DevOps'
  | 'AI/ML'
  | 'Networking'
  | 'Development'
  | 'Business'
  | 'Database'
  | 'Infrastructure'
  | 'Other'

// ============================================
// Past Creatives Library Types
// ============================================

export interface LibraryCreative {
  id: string
  name: string
  imageBase64: string
  uploadedAt: string
  tags: string[]
  vendor?: string
  campaignName?: string
  templateStyle?: string
  width?: number
  height?: number
}

export interface TemplateExtraction {
  id: string
  sourceImageId: string
  layoutZones: {
    type: 'text' | 'image' | 'logo' | 'cta'
    position: { x: number; y: number; width: number; height: number }
    content?: string
    style?: Record<string, string | number>
  }[]
  colorPalette: string[]
  suggestedTemplate?: string // JSON of Satori component
  status: 'analyzing' | 'completed' | 'error'
}

// ============================================
// Export Types
// ============================================

export interface CreativeExportConfig {
  platforms: ('google_pmax' | 'linkedin')[]
  includeGadsEditorCsv: boolean
  zipStructure: 'flat' | 'by_course' | 'by_size'
}

// ============================================
// State Types
// ============================================

export interface CreativeGenState {
  phase: 'idle' | 'uploading' | 'generating_copy' | 'rendering' | 'completed' | 'error'
  totalCourses: number
  completedCourses: number
  totalImages: number
  completedImages: number
  errors: { courseIndex: number; error: string }[]
  startTime?: number
}

// ============================================
// CSV Input Types (for creative generation)
// ============================================

export interface CreativeCSVRow {
  url?: string
  courseName: string
  vendor: string
  courseCode?: string
  certification?: string
  courseTopics?: string
  cta?: string
  tagline?: string
  duration?: string
  bullets?: string
}

// ============================================
// API Request/Response Types
// ============================================

export interface RenderImageRequest {
  templateUuid: string
  layers: Record<string, { text?: string; image?: string; color?: string }>
}

export interface RenderImageResponse {
  imageUrl: string
  imageBase64?: string
  placidImageId: string
}

export interface RenderBatchRequest {
  templateIds: string[]
  sizeIds: string[]
  courses: CreativeCSVRow[]
  options: {
    useAiCopy: boolean
    useAiBackground: boolean
    cta?: string
  }
}

export interface GenerateCopyRequest {
  courseName: string
  vendor: string
  topics?: string[]
  targetAudience?: string
  usps?: string[]
}

export interface GenerateBackgroundRequest {
  category: CourseCategory
  aspectRatio: '16:9' | '1:1' | '4:5'
  style?: string
}
