import { useCallback, useEffect, useRef, useState } from "react"
import type { Language } from "@/types"

interface SpeechRecognitionAlternativeLike {
  readonly transcript: string
}

interface SpeechRecognitionResultLike {
  readonly isFinal: boolean
  readonly length: number
  readonly [index: number]: SpeechRecognitionAlternativeLike
}

interface SpeechRecognitionResultListLike {
  readonly length: number
  readonly [index: number]: SpeechRecognitionResultLike
}

interface SpeechRecognitionEventLike {
  readonly results: SpeechRecognitionResultListLike
}

interface SpeechRecognitionInstance {
  lang: string
  continuous: boolean
  interimResults: boolean
  onresult: ((event: SpeechRecognitionEventLike) => void) | null
  onerror: (() => void) | null
  onend: (() => void) | null
  start: () => void
  stop: () => void
  abort: () => void
}

type SpeechRecognitionConstructor = new () => SpeechRecognitionInstance

function getSpeechRecognitionCtor(): SpeechRecognitionConstructor | null {
  if (typeof window === "undefined") return null
  const win = window as unknown as {
    SpeechRecognition?: SpeechRecognitionConstructor
    webkitSpeechRecognition?: SpeechRecognitionConstructor
  }
  return win.SpeechRecognition ?? win.webkitSpeechRecognition ?? null
}

interface UseVoiceInputOptions {
  lang: Language
  onChange: (nextValue: string) => void
  onUnsupported?: () => void
}

export function useVoiceInput({ lang, onChange, onUnsupported }: UseVoiceInputOptions) {
  const [isListening, setIsListening] = useState(false)
  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null)
  const baseValueRef = useRef("")
  const onChangeRef = useRef(onChange)
  const onUnsupportedRef = useRef(onUnsupported)

  useEffect(() => {
    onChangeRef.current = onChange
    onUnsupportedRef.current = onUnsupported
  }, [onChange, onUnsupported])

  const stopListening = useCallback(() => {
    const rec = recognitionRef.current
    if (rec) {
      recognitionRef.current = null
      try {
        rec.stop()
      } catch {
        // ignore stop errors when already stopped
      }
    }
    setIsListening(false)
  }, [])

  const toggleListening = useCallback(
    (currentValue: string) => {
      if (isListening) {
        stopListening()
        return
      }

      const Ctor = getSpeechRecognitionCtor()
      if (!Ctor) {
        onUnsupportedRef.current?.()
        return
      }

      try {
        const rec = new Ctor()
        rec.lang = lang === "uk" ? "uk-UA" : "en-US"
        rec.continuous = true
        rec.interimResults = true

        const trimmed = currentValue.trimEnd()
        baseValueRef.current = trimmed ? `${trimmed} ` : ""

        rec.onresult = (event: SpeechRecognitionEventLike) => {
          const chunks: string[] = []
          for (let i = 0; i < event.results.length; i += 1) {
            const alt = event.results[i]?.[0]
            if (alt?.transcript) {
              chunks.push(alt.transcript)
            }
          }
          const combined = chunks.join("").trimStart()
          onChangeRef.current(`${baseValueRef.current}${combined}`)
        }

        rec.onerror = () => {
          recognitionRef.current = null
          setIsListening(false)
        }

        rec.onend = () => {
          recognitionRef.current = null
          setIsListening(false)
        }

        recognitionRef.current = rec
        rec.start()
        setIsListening(true)
      } catch {
        recognitionRef.current = null
        setIsListening(false)
      }
    },
    [isListening, lang, stopListening],
  )

  useEffect(() => {
    return () => {
      const rec = recognitionRef.current
      if (rec) {
        recognitionRef.current = null
        try {
          rec.abort()
        } catch {
          // ignore cleanup errors
        }
      }
    }
  }, [])

  return {
    isListening,
    toggleListening,
    stopListening,
  }
}
