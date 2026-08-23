import type { HttpFn } from '@/utils/http';
import type { Tc3Credentials } from '@/utils/tc3';

import { obsidianHttp } from '@/utils/http';
import { tc3SignedHeaders } from '@/utils/tc3';

import type {
	TranslateRequest,
	TranslateResult,
	TranslationProvider,
} from './translation-provider';

export const TENCENT_TRANSLATE_ID = 'tencent-translate';

/**
 * Tencent Cloud machine translation (TMT). The free monthly character
 * quota is in the millions; signup needs a Chinese phone number and
 * real-name verification, no international payment method.
 */
export class TencentTranslateProvider implements TranslationProvider {
	readonly id = TENCENT_TRANSLATE_ID;
	readonly label = 'Tencent Cloud';

	constructor(
		private readonly getCredentials: () => Tc3Credentials | null,
		private readonly http: HttpFn = obsidianHttp,
	) {}

	isConfigured(): boolean {
		const credentials = this.getCredentials();
		if (!credentials) return false;
		return credentials.secretId.trim() !== '' && credentials.secretKey.trim() !== '';
	}

	async translate(request: TranslateRequest): Promise<TranslateResult> {
		const credentials = this.getCredentials();
		if (!credentials || !this.isConfigured()) {
			throw new Error('tencent translate is not configured');
		}
		const payload = JSON.stringify({
			SourceText: request.word,
			Source: tencentLang(request.from),
			Target: tencentLang(request.to),
			ProjectId: 0,
		});
		const headers = await tc3SignedHeaders(
			{
				host: 'tmt.tencentcloudapi.com',
				service: 'tmt',
				action: 'TextTranslate',
				version: '2018-03-21',
				payload,
				// TC3 common param — sent as the `X-TC-Region` header (not in body).
				// Change if your resources live in another region.
				region: 'ap-guangzhou',
			},
			credentials,
		);

		const response = await this.http({
			url: 'https://tmt.tencentcloudapi.com',
			method: 'POST',
			headers,
			body: payload,
		});
		if (response.status !== 200) {
			throw new Error(`tencent translate failed (${response.status})`);
		}

		const data = JSON.parse(response.text) as {
			Response?: { TranslatedText?: string; Error?: { Code?: string; Message?: string } };
		};
		if (data.Response?.Error) {
			throw new Error(`tencent translate error ${data.Response.Error.Code ?? 'unknown'}`);
		}
		const translation = data.Response?.TranslatedText;
		if (!translation) {
			throw new Error('tencent translate returned no translation');
		}
		return { translation, engine: this.id };
	}
}

/** TMT wants short codes like `en` and `zh`. */
function tencentLang(tag: string): string {
	return tag.toLowerCase().split('-')[0] ?? tag;
}
