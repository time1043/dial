import type {
	TranslateRequest,
	TranslateResult,
	TranslationProvider,
} from './translation-provider';

/**
 * Ordered translation pipeline, mirroring the speech chain: configured
 * engines are tried top to bottom until one succeeds.
 *
 * Per-engine failures are logged to the console but not turned into
 * toasts: a benign "no translation returned" is not something the
 * user can act on, and surfacing it crowds out useful signals. The
 * chain still appends a line to the query log with the real outcome,
 * which is the right surface for investigating why a word came back
 * empty.
 */
export class TranslationChain {
	constructor(private readonly providers: readonly TranslationProvider[]) {}

	statuses(): { id: string; label: string; configured: boolean }[] {
		return this.providers.map((provider) => ({
			id: provider.id,
			label: provider.label,
			configured: provider.isConfigured(),
		}));
	}

	firstConfigured(): TranslationProvider | null {
		return this.providers.find((provider) => provider.isConfigured()) ?? null;
	}

	/** Try each configured engine in order; null when none succeeded. */
	async translateAndReport(
		request: TranslateRequest,
	): Promise<{ result: TranslateResult; provider: TranslationProvider } | null> {
		for (const provider of this.providers) {
			if (!provider.isConfigured()) continue;
			try {
				return { result: await provider.translate(request), provider };
			} catch (err) {
				// Engine failed — fall through to the next one. The real
				// cause stays in the console for debuggability; the query
				// log records the eventual outcome for the user.
				console.error(`[translation-chain] ${provider.label} failed:`, err);
			}
		}
		return null;
	}

	async translate(request: TranslateRequest): Promise<TranslateResult> {
		const outcome = await this.translateAndReport(request);
		if (!outcome) {
			throw new Error('no configured translation engine could translate the word');
		}
		return outcome.result;
	}
}

/**
 * Arrange engines into the user's priority order. Same rules as the
 * speech chain: unknown ids dropped, engines missing from the stored
 * order appended at the end (registry order).
 */
export function orderTranslationEngines(
	registry: readonly TranslationProvider[],
	order: readonly string[],
): TranslationProvider[] {
	const remaining = new Map(registry.map((provider) => [provider.id, provider]));
	const ordered: TranslationProvider[] = [];
	for (const id of order) {
		const provider = remaining.get(id);
		if (provider) {
			ordered.push(provider);
			remaining.delete(id);
		}
	}
	return [...ordered, ...remaining.values()];
}
