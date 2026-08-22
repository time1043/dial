import type { HttpFn } from '@/utils/http';

import { obsidianHttp } from '@/utils/http';

import type {
	TranslateRequest,
	TranslateResult,
	TranslationProvider,
} from './translation-provider';

export const AZURE_TRANSLATE_ID = 'azure-translate';

export interface AzureTranslateCredentials {
	key: string;
	/** Azure region, e.g. `eastus` or `global`. */
	region: string;
}

/**
 * Azure Translator (Text Translation v3 REST). Free tier F0 allows
 * 2M characters/month — a word lookup is ~15 characters, so the quota
 * comfortably covers daily use.
 */
export class AzureTranslateProvider implements TranslationProvider {
	readonly id = AZURE_TRANSLATE_ID;
	readonly label = 'Azure Translator';

	constructor(
		private readonly getCredentials: () => AzureTranslateCredentials | null,
		private readonly http: HttpFn = obsidianHttp,
	) {}

	isConfigured(): boolean {
		const credentials = this.getCredentials();
		if (!credentials) return false;
		return credentials.key.trim() !== '' && credentials.region.trim() !== '';
	}

	async translate(request: TranslateRequest): Promise<TranslateResult> {
		const credentials = this.getCredentials();
		if (!credentials || !this.isConfigured()) {
			throw new Error('azure translator is not configured');
		}
		const url =
			'https://api.cognitive.microsofttranslator.com/translate?api-version=3.0' +
			`&from=${encodeURIComponent(azureLang(request.from))}` +
			`&to=${encodeURIComponent(azureLang(request.to))}`;

		const response = await this.http({
			url,
			method: 'POST',
			headers: {
				'Ocp-Apim-Subscription-Key': credentials.key,
				'Ocp-Apim-Subscription-Region': credentials.region,
				'Content-Type': 'application/json',
			},
			body: JSON.stringify([{ Text: request.word }]),
		});
		if (response.status !== 200) {
			throw new Error(`azure translator failed (${response.status})`);
		}

		const data = JSON.parse(response.text) as { translations?: { text?: string }[] }[];
		const translation = data[0]?.translations?.[0]?.text;
		if (!translation) {
			throw new Error('azure translator returned no translation');
		}
		return { translation, engine: this.id };
	}
}

/** Azure wants `zh-Hans` where we store the generic `zh`. */
function azureLang(tag: string): string {
	if (tag.toLowerCase() === 'zh') return 'zh-Hans';
	return tag;
}
