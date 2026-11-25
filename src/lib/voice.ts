import { LANGUAGE_TAGS } from './utils'

let active: SpeechSynthesisUtterance | null = null

export function ttsSupported() {
  return typeof window !== 'undefined' && 'speechSynthesis' in window
}

export function listVoices() {
  if (!ttsSupported()) return []
  return window.speechSynthesis.getVoices()
}

export function voicesForLanguage(language: string) {
  const tag = (LANGUAGE_TAGS[language] ?? 'en-IN').toLowerCase()
  const base = tag.split('-')[0]
  const voices = listVoices()
  const exact = voices.filter((v) => v.lang.toLowerCase().replace('_', '-') === tag)
  if (exact.length) return exact
  return voices.filter((v) => v.lang.toLowerCase().startsWith(base))
}

export function speak(
  text: string,
  language: string,
  handlers?: { onStart?: () => void; onEnd?: () => void; onError?: (message: string) => void },
) {
  if (!ttsSupported()) {
    handlers?.onError?.('Speech synthesis is not available in this browser.')
    return false
  }
  stopSpeaking()
  const utterance = new SpeechSynthesisUtterance(text)
  const tag = LANGUAGE_TAGS[language] ?? 'en-IN'
  utterance.lang = tag
  const voices = voicesForLanguage(language)
  const matching = voices.find((v) => v.lang.toLowerCase() === tag.toLowerCase()) ?? voices[0]
  if (matching) utterance.voice = matching
  utterance.rate = language === 'en' ? 1 : 0.94
  utterance.pitch = 1
  utterance.onstart = () => handlers?.onStart?.()
  utterance.onend = () => {
    active = null
    handlers?.onEnd?.()
  }
  utterance.onerror = (event) => {
    active = null
    if (event.error !== 'interrupted' && event.error !== 'canceled') {
      handlers?.onError?.(`Voice playback failed (${event.error}).`)
    }
    handlers?.onEnd?.()
  }
  active = utterance
  window.speechSynthesis.speak(utterance)
  return true
}

export function stopSpeaking() {
  if (!ttsSupported()) return
  window.speechSynthesis.cancel()
  active = null
}

export function isSpeaking() {
  return ttsSupported() && window.speechSynthesis.speaking
}
