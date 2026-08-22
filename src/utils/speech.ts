import { Notice } from 'obsidian';

/**
 * Whether this environment can pronounce words with the Web Speech API.
 *
 * Desktop Obsidian (Electron/Chromium) and iOS (WKWebView 14.5+) expose it;
 * Android's system WebView never implemented the platform TTS bridge, so
 * `speechSynthesis` is simply absent there. Checked via `typeof` so a
 * property that exists but holds `undefined` still counts as missing.
 *
 * Shared by the word card (feature gate) and the settings tab (status row).
 */
export function isSpeechSynthesisAvailable(): boolean {
	return (
		typeof speechSynthesis !== 'undefined' && typeof SpeechSynthesisUtterance !== 'undefined'
	);
}

/**
 * Pronounce one word with the Web Speech API (offline TTS).
 *
 * Any in-flight utterance is cancelled first so rapid taps replace rather
 * than queue. When the API is missing (Android WebView), silently skips for
 * auto-pronounce (`notifyIfUnavailable = false`) or toasts once for an
 * explicit button press.
 */
export function speakWord(word: string, lang: string, notifyIfUnavailable = true): void {
	if (!word) return;
	if (!isSpeechSynthesisAvailable()) {
		if (notifyIfUnavailable) {
			new Notice('Speech synthesis is not available in this environment');
		}
		return;
	}
	const utterance = new SpeechSynthesisUtterance(word);
	utterance.lang = lang;
	window.speechSynthesis.cancel();
	window.speechSynthesis.speak(utterance);
}
