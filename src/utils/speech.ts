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
		typeof speechSynthesis !== 'undefined' &&
		typeof SpeechSynthesisUtterance !== 'undefined'
	);
}
