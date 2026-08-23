/** A single pronunciation request handed to a speech engine. */
export interface SpeakRequest {
	word: string;
	/** BCP 47 language tag, e.g. `en-US`. */
	lang: string;
}

/**
 * One pronunciation engine behind the word card / word flip speak
 * actions. Implementations: the offline Web Speech API (`system`) and,
 * in later iterations, opt-in cloud providers (Azure, Google).
 */
export interface SpeechProvider {
	/** Stable id used in settings (engine order) and logs. */
	readonly id: string;
	/** Human-readable name for the settings page. */
	readonly label: string;
	/** `system` engines are free/offline; `cloud` engines need a key. */
	readonly kind: 'system' | 'cloud';
	/** False when this engine cannot run here (missing API or key). */
	isAvailable(): boolean;
	/**
	 * Pronounce the word. Rejects on failure so a caller chaining engines
	 * can fall through to the next one.
	 */
	speak(request: SpeakRequest): Promise<void>;
}

/**
 * A SpeechProvider whose audio arrives as bytes (cloud TTS). The
 * synthesize/play split lets a caching decorator replay stored audio or
 * cache fresh bytes without re-fetching.
 */
export interface SynthesizingSpeechProvider extends SpeechProvider {
	synthesize(request: SpeakRequest): Promise<ArrayBuffer>;
}
