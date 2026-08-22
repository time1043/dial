import { Notice } from 'obsidian';

import { systemSpeechProvider } from '@/modules/speech/system-speech-provider';

/**
 * Whether this environment can pronounce words with the Web Speech API.
 *
 * Desktop Obsidian (Electron/Chromium) and iOS (WKWebView 14.5+) expose it;
 * Android's system WebView never implemented the platform TTS bridge, so
 * `speechSynthesis` is simply absent there.
 *
 * Thin delegation to {@link systemSpeechProvider} — the provider owns the
 * check so there is a single source of truth. Kept as a util because the
 * settings tab and the word flip view gate on it directly.
 */
export function isSpeechSynthesisAvailable(): boolean {
	return systemSpeechProvider.isAvailable();
}

/**
 * Pronounce one word with the system speech engine (offline).
 *
 * When the engine is missing (Android WebView), silently skips for
 * auto-pronounce (`notifyIfUnavailable = false`) or toasts once for an
 * explicit button press.
 */
export function speakWord(word: string, lang: string, notifyIfUnavailable = true): void {
	if (!word) return;
	systemSpeechProvider.speak({ word, lang }).catch(() => {
		if (notifyIfUnavailable) {
			new Notice('Speech synthesis is not available in this environment');
		}
	});
}
