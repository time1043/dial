import type { HttpFn } from '@/utils/http';

import { obsidianHttp } from '@/utils/http';
import { md5 } from '@/utils/md5';

import type {
	TranslateRequest,
	TranslateResult,
	TranslationProvider,
} from './translation-provider';

export const BAIDU_TRANSLATE_ID = 'baidu-translate';

export interface BaiduTranslateCredentials {
	appId: string;
	secret: string;
}

/**
 * Baidu Translate open platform. Signup needs only a Chinese phone
 * number plus real-name verification — no international payment method,
 * which is why it exists alongside the Azure/DeepL engines. The free
 * tier's monthly character quota is generous for word lookups.
 *
 * Request signing is `md5(appid + q + salt + secret)`.
 */
export class BaiduTranslateProvider implements TranslationProvider {
	readonly id = BAIDU_TRANSLATE_ID;
	readonly label = 'Baidu Translate';

	constructor(
		private readonly getCredentials: () => BaiduTranslateCredentials | null,
		private readonly http: HttpFn = obsidianHttp,
	) {}

	isConfigured(): boolean {
		const credentials = this.getCredentials();
		if (!credentials) return false;
		return credentials.appId.trim() !== '' && credentials.secret.trim() !== '';
	}

	async translate(request: TranslateRequest): Promise<TranslateResult> {
		const credentials = this.getCredentials();
		if (!credentials || !this.isConfigured()) {
			throw new Error('baidu translate is not configured');
		}
		const salt = String(Date.now() % 2147483647);
		const sign = md5(credentials.appId + request.word + salt + credentials.secret);
		const params = new URLSearchParams({
			q: request.word,
			from: baiduLang(request.from),
			to: baiduLang(request.to),
			appid: credentials.appId,
			salt,
			sign,
		});

		const response = await this.http({
			url: 'https://fanyi-api.baidu.com/api/trans/vip/translate',
			method: 'POST',
			headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
			body: params.toString(),
		});
		if (response.status !== 200) {
			throw new Error(`baidu translate failed (${response.status})`);
		}

		const data = JSON.parse(response.text) as {
			trans_result?: { dst?: string }[];
			error_code?: string;
		};
		if (data.error_code) {
			throw new Error(`baidu translate error ${data.error_code}`);
		}
		const translation = data.trans_result?.map((item) => item.dst ?? '').join(' ');
		if (!translation) {
			throw new Error('baidu translate returned no translation');
		}
		return { translation, engine: this.id };
	}
}

/** Baidu's translate API wants `zh`, not `zh-CN` style tags. */
function baiduLang(tag: string): string {
	return tag.toLowerCase().split('-')[0] ?? tag;
}
