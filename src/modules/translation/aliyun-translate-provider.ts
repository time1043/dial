import type { HttpFn } from '@/utils/http';

import { signAliyunRpc, type AliyunCredentials, type RpcParams } from '@/utils/aliyun';
import { obsidianHttp } from '@/utils/http';

import type {
	TranslateRequest,
	TranslateResult,
	TranslationProvider,
} from './translation-provider';

export const ALIYUN_TRANSLATE_ID = 'aliyun-translate';

/**
 * Alibaba Cloud machine translation (general edition). Shares the
 * AccessKey pair with the Aliyun speech engine — one aliyun account
 * covers both. Signup needs only a Chinese phone number plus real-name
 * verification, no international payment method.
 *
 * Machine translation is an RPC-style API, signed with the same
 * HMAC-SHA1 POP signature as the NLS token endpoint.
 */
export class AliyunTranslateProvider implements TranslationProvider {
	readonly id = ALIYUN_TRANSLATE_ID;
	readonly label = 'Alibaba Cloud';

	constructor(
		private readonly getCredentials: () => AliyunCredentials | null,
		private readonly http: HttpFn = obsidianHttp,
		private readonly now: () => Date = () => new Date(),
	) {}

	isConfigured(): boolean {
		const credentials = this.getCredentials();
		if (!credentials) return false;
		return credentials.accessKeyId.trim() !== '' && credentials.accessKeySecret.trim() !== '';
	}

	async translate(request: TranslateRequest): Promise<TranslateResult> {
		const credentials = this.getCredentials();
		if (!credentials || !this.isConfigured()) {
			throw new Error('alibaba translate is not configured');
		}
		const timestamp = Math.floor(this.now().getTime() / 1000);
		const params: RpcParams = {
			Action: 'TranslateGeneral',
			Version: '2018-10-12',
			Format: 'text',
			Scene: 'general',
			SourceLanguage: mtLang(request.from),
			TargetLanguage: mtLang(request.to),
			SourceText: request.word,
			AccessKeyId: credentials.accessKeyId,
			Timestamp: new Date(timestamp * 1000).toISOString().replace(/\.\d{3}Z$/, 'Z'),
			SignatureMethod: 'HMAC-SHA1',
			SignatureVersion: '1.0',
			SignatureNonce: `${timestamp}-${Math.random().toString(36).slice(2)}`,
		};
		params.Signature = await signAliyunRpc(params, credentials);

		const query = Object.entries(params)
			.map(([key, value]) => {
				// Mirror the official specialUrlEncode used for signing.
				const encoded = encodeURIComponent(value)
					.replace(/\*/g, '%2A')
					.replace(/%7E/g, '~');
				return `${encodeURIComponent(key)}=${encoded}`;
			})
			.join('&');

		const response = await this.http({
			url: `https://mt.aliyuncs.com/?${query}`,
			method: 'GET',
		});
		if (response.status !== 200) {
			throw new Error(`alibaba translate failed (${response.status})`);
		}

		const data = JSON.parse(response.text) as {
			Data?: { Translated?: string };
			Code?: string;
			Message?: string;
		};
		if (data.Code) {
			throw new Error(`alibaba translate error ${data.Code}`);
		}
		const translation = data.Data?.Translated;
		if (!translation) {
			throw new Error('alibaba translate returned no translation');
		}
		return { translation, engine: this.id };
	}
}

/** MT language codes are primary subtags (`zh`, `en`, …). */
function mtLang(tag: string): string {
	return tag.toLowerCase().split('-')[0] ?? tag;
}
