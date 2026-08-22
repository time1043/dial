import type { SpeakRequest, SpeechProvider } from './speech-provider';

/**
 * Ordered pronunciation pipeline: engines are tried top to bottom, the
 * first available one that succeeds wins. Implements {@link SpeechProvider}
 * so consumers (word card) can take a chain wherever a single engine fits.
 */
export class SpeechChain implements SpeechProvider {
	readonly id = 'chain';
	readonly label = 'Engine chain';

	constructor(private readonly providers: readonly SpeechProvider[]) {}

	/** One row per engine, in try order, for the settings traffic lights. */
	statuses(): { id: string; label: string; available: boolean }[] {
		return this.providers.map((provider) => ({
			id: provider.id,
			label: provider.label,
			available: provider.isAvailable(),
		}));
	}

	firstAvailable(): SpeechProvider | null {
		return this.providers.find((provider) => provider.isAvailable()) ?? null;
	}

	isAvailable(): boolean {
		return this.firstAvailable() !== null;
	}

	/**
	 * Try each available engine in order until one succeeds. Resolves with
	 * the engine that spoke (for logs/stats), or null when none could.
	 */
	async speakAndReport(request: SpeakRequest): Promise<SpeechProvider | null> {
		for (const provider of this.providers) {
			if (!provider.isAvailable()) continue;
			try {
				await provider.speak(request);
				return provider;
			} catch {
				// Engine failed mid-request — fall through to the next one.
			}
		}
		return null;
	}

	async speak(request: SpeakRequest): Promise<void> {
		const engine = await this.speakAndReport(request);
		if (!engine) {
			throw new Error('no available speech engine could pronounce the word');
		}
	}
}

/**
 * Arrange the engine registry into the user's priority order. Ids in the
 * stored order that are not in the registry are dropped; registry engines
 * missing from the stored order are appended at the end (registry order),
 * so engines shipped later appear without a settings migration.
 */
export function orderSpeechEngines(
	registry: readonly SpeechProvider[],
	order: readonly string[],
): SpeechProvider[] {
	const remaining = new Map(registry.map((provider) => [provider.id, provider]));
	const ordered: SpeechProvider[] = [];
	for (const id of order) {
		const provider = remaining.get(id);
		if (provider) {
			ordered.push(provider);
			remaining.delete(id);
		}
	}
	return [...ordered, ...remaining.values()];
}
