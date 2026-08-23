export interface TranslateRequest {
	word: string;
	/** Source language tag, e.g. `en`. */
	from: string;
	/** Target language tag, e.g. `zh`. */
	to: string;
}

export interface TranslateResult {
	translation: string;
	/** Engine id that produced this translation. */
	engine: string;
}

/**
 * One translation engine. All implementations are opt-in cloud services
 * (offline local-dictionary engines may join later under the same
 * contract). An engine without credentials reports `isConfigured()
 * === false` and is skipped by the chain.
 */
export interface TranslationProvider {
	/** Stable id used in settings (engine order) and logs. */
	readonly id: string;
	/** Human-readable name for the settings page. */
	readonly label: string;
	/** True when the engine has everything it needs (API key, region…). */
	isConfigured(): boolean;
	/** Translate one word. Rejects on failure so the chain can fall through. */
	translate(request: TranslateRequest): Promise<TranslateResult>;
}
