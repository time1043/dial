import type { HttpFn } from '@/utils/http';

import { obsidianHttp } from '@/utils/http';

import type {
	TranslateRequest,
	TranslateResult,
	TranslationProvider,
} from './translation-provider';

export const DEEPL_TRANSLATE_ID = 'deepl';

export interface DeeplCredentials {
	key: string;
	/** Free and pro keys hit different API hosts. */
	plan: 'free' | 'pro';
}

/**
 * DeepL API. Free tier allows 500K characters/month. Signup may require
 * a payment card for verification — that is DeepL's policy, not ours.
 */
export class DeeplTranslateProvider implements TranslationProvider {
	readonly id = DEEPL_TRANSLATE_ID;
	readonly label = 'DeepL';

	constructor(
		private readonly getCredentials: () => DeeplCredentials | null,
		private readonly http: HttpFn = obsidianHttp,
	) {}

	isConfigured(): boolean {
		const credentials = this.getCredentials();
		if (!credentials) return false;
		return credentials.key.trim() !== '';
	}

	async translate(request: TranslateRequest): Promise<TranslateResult> {
		const credentials = this.getCredentials();
		if (!credentials || !this.isConfigured()) {
			throw new Error('deepl is not configured');
		}
		const host = credentials.plan === 'free' ? 'api-free.deepl.com' : 'api.deepl.com';

		const response = await this.http({
			url: `https://${host}/v2/translate`,
			method: 'POST',
			headers: {
				Authorization: `DeepL-Auth-Key ${credentials.key}`,
				'Content-Type': 'application/json',
			},
			body: JSON.stringify({
				text: [request.word],
				target_lang: request.to.toUpperCase(),
			}),
		});
		if (response.status !== 200) {
			throw new Error(`deepl failed (${response.status})`);
		}

		const data = JSON.parse(response.text) as { translations?: { text?: string }[] };
		const translation = data.translations?.[0]?.text;
		if (!translation) {
			throw new Error('deepl returned no translation');
		}
		return { translation, engine: this.id };
	}
}
