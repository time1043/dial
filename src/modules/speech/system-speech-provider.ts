import type { SpeakRequest, SpeechProvider } from './speech-provider';

export const SYSTEM_SPEECH_ID = 'system';

/**
 * Pronunciation via the browser's built-in speechSynthesis (free,
 * offline). Available on desktop (Electron) and iOS (WKWebView 14.5+);
 * absent on Android, whose system WebView never implemented the TTS
 * bridge. The availability check is the single source of truth —
 * `utils/speech` delegates here.
 */
export class SystemSpeechProvider implements SpeechProvider {
	readonly id = SYSTEM_SPEECH_ID;
	readonly label = 'System (Web Speech)';
	readonly kind = 'system' as const;

	isAvailable(): boolean {
		return (
			typeof speechSynthesis !== 'undefined' &&
			typeof SpeechSynthesisUtterance !== 'undefined'
		);
	}

	async speak(request: SpeakRequest): Promise<void> {
		if (!this.isAvailable()) {
			throw new Error('speech synthesis is not available in this environment');
		}
		const utterance = new SpeechSynthesisUtterance(request.word);
		utterance.lang = request.lang;
		// Replace any in-flight utterance so rapid taps replace rather than queue.
		window.speechSynthesis.cancel();
		window.speechSynthesis.speak(utterance);
	}
}

/** Shared instance — the provider is stateless. */
export const systemSpeechProvider = new SystemSpeechProvider();
