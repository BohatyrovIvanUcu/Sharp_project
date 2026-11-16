import type { SessionAttachmentInput } from "@/types"

export const MAX_ATTACHMENT_FILES = 5
export const MAX_ATTACHMENT_BYTES = 2_500_000
const MAX_EXCERPT_CHARS = 12_000

const TEXT_EXTENSIONS = new Set([
  "txt",
  "md",
  "markdown",
  "csv",
  "json",
  "py",
  "ts",
  "tsx",
  "js",
  "jsx",
  "mjs",
  "cjs",
  "css",
  "scss",
  "sql",
  "yaml",
  "yml",
  "xml",
  "log",
  "c",
  "cpp",
  "cc",
  "h",
  "hpp",
  "java",
  "go",
  "rs",
  "sh",
  "toml",
  "ini",
  "lua",
])

const TEXT_MIMES = new Set([
  "application/json",
  "application/xml",
  "application/javascript",
  "application/x-python",
  "application/x-yaml",
])

export const ACCEPTED_FILE_TYPES =
  ".txt,.md,.csv,.json,.py,.ts,.tsx,.js,.jsx,.css,.sql,.yaml,.yml,.xml,.log,.c,.cpp,.h,.java,.go,.rs,.sh,.lua,.pdf,.png,.jpg,.jpeg,.webp"

// eslint-disable-next-line no-control-regex
const CONTROL_AND_BIDI_RE = /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f\u202a-\u202e\u2066-\u2069]/g

function sanitizeFileName(rawName: string): string {
  const cleaned = rawName.replace(CONTROL_AND_BIDI_RE, "").replace(/[\r\n]+/g, " ").trim()
  return (cleaned || "file").slice(0, 160)
}

function sanitizeTextExcerpt(rawText: string): string {
  return rawText.replace(CONTROL_AND_BIDI_RE, "").slice(0, MAX_EXCERPT_CHARS)
}

function isReadableTextFile(file: File): boolean {
  if (file.type === "text/html") return false
  if (file.type.startsWith("text/") || TEXT_MIMES.has(file.type)) {
    return true
  }
  const ext = file.name.split(".").pop()?.toLowerCase() ?? ""
  return TEXT_EXTENSIONS.has(ext)
}

async function readFileText(file: File): Promise<string | undefined> {
  if (typeof file.text === "function") {
    try {
      return await file.text()
    } catch {
      // Fallback to FileReader below
    }
  }
  if (typeof FileReader === "undefined") return undefined
  return new Promise((resolve) => {
    const reader = new FileReader()
    reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : undefined)
    reader.onerror = () => resolve(undefined)
    reader.readAsText(file)
  })
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export async function readAttachmentsFromFileList(
  fileList: FileList | null,
  existing: SessionAttachmentInput[],
  tooLargeMessage: string,
): Promise<{ next: SessionAttachmentInput[]; error: string | null }> {
  if (!fileList || fileList.length === 0) {
    return { next: existing, error: null }
  }

  let error: string | null = null
  const next = [...existing]

  for (const file of Array.from(fileList)) {
    if (next.length >= MAX_ATTACHMENT_FILES) break
    const safeName = sanitizeFileName(file.name)
    if (file.size > MAX_ATTACHMENT_BYTES) {
      error = `${safeName}: ${tooLargeMessage}`
      continue
    }
    let excerpt: string | undefined
    if (isReadableTextFile(file)) {
      const rawText = await readFileText(file)
      if (rawText) {
        excerpt = sanitizeTextExcerpt(rawText) || undefined
      }
    }
    const item: SessionAttachmentInput = {
      name: safeName,
      mime_type: file.type || "application/octet-stream",
      size_bytes: file.size,
      ...(excerpt ? { text_excerpt: excerpt } : {}),
    }
    const existingIdx = next.findIndex(
      (f) => f.name === item.name && f.size_bytes === item.size_bytes,
    )
    if (existingIdx >= 0) next[existingIdx] = item
    else next.push(item)
  }

  return { next, error }
}
