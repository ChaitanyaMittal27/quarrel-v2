import { createContext } from 'react'
import type { useSpeech } from './useSpeech'
export const SpeechContext=createContext<ReturnType<typeof useSpeech>|null>(null)
