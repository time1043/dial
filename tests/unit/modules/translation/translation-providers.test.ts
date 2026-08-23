import { describe, expect, it, vi } from 'vitest';

import type { TranslationProvider } from '@/modules/translation/translation-provider';
import type { HttpTextRequest, HttpTextResponse } from '@/utils/http';

import { AzureTranslateProvider } from '@/modules/translation/azure-translate-provider';
import { BaiduTranslateProvider } from '@/modules/translation/baidu-translate-provider';
import { DeeplTranslateProvider } from '@/modules/translation/deepl-translate-provider';
import { orderTranslationEngines, TranslationChain } from '@/modules/translation/translation-chain';
import { md5 } from '@/utils/md5';

function okHttp(body: unknown, capture?: (req: HttpTextRequest) => void) {
	return async (req: HttpTextRequest): Promise<HttpTextResponse> => {
		capture?.(req);
		return { status: 200, text: JSON.stringify(body) };
	};
}

const REQUEST = { word: 'hello', from: 'en', to: 'zh' };

describe('AzureTranslateProvider', () => {
	it('sends key/region headers and extracts the translation', async () => {
		let sent: HttpTextRequest | undefined;
		const provider = new AzureTranslateProvider(
			() => ({ key: 'k1', region: 'eastus' }),
			okHttp([{ translations: [{ text: '你好' }] }], (req) => (sent = req)),
		);

		const result = await provider.translate(REQUEST);
		expect(result).toEqual({ translation: '你好', engine: 'azure-translate' });
		expect(sent?.url).toContain('from=en');
		expect(sent?.url).toContain('to=zh-Hans');
		expect(sent?.headers?.['Ocp-Apim-Subscription-Key']).toBe('k1');
		expect(sent?.headers?.['Ocp-Apim-Subscription-Region']).toBe('eastus');
		expect(sent?.body).toBe(JSON.stringify([{ Text: 'hello' }]));
	});

	it('is unconfigured without key or region and refuses to translate', async () => {
		const provider = new AzureTranslateProvider(() => ({ key: ' ', region: '' }), okHttp([]));
		expect(provider.isConfigured()).toBe(false);
		await expect(provider.translate(REQUEST)).rejects.toThrow(/not configured/i);
	});

	it('throws on non-200 responses', async () => {
		const provider = new AzureTranslateProvider(
			() => ({ key: 'k', region: 'r' }),
			async () => ({ status: 401, text: '' }),
		);
		await expect(provider.translate(REQUEST)).rejects.toThrow(/\(401\)/);
	});
});

describe('DeeplTranslateProvider', () => {
	it('hits the free host with the auth header and uppercase target', async () => {
		let sent: HttpTextRequest | undefined;
		const provider = new DeeplTranslateProvider(
			() => ({ key: 'dk', plan: 'free' }),
			okHttp({ translations: [{ text: '你好' }] }, (req) => (sent = req)),
		);

		const result = await provider.translate(REQUEST);
		expect(result).toEqual({ translation: '你好', engine: 'deepl' });
		expect(sent?.url).toBe('https://api-free.deepl.com/v2/translate');
		expect(sent?.headers?.Authorization).toBe('DeepL-Auth-Key dk');
		expect(JSON.parse(sent?.body ?? '{}')).toEqual({ text: ['hello'], target_lang: 'ZH' });
	});

	it('uses the pro host for pro keys', async () => {
		let sent: HttpTextRequest | undefined;
		const provider = new DeeplTranslateProvider(
			() => ({ key: 'dk', plan: 'pro' }),
			okHttp({ translations: [{ text: '你好' }] }, (req) => (sent = req)),
		);
		await provider.translate(REQUEST);
		expect(sent?.url).toBe('https://api.deepl.com/v2/translate');
	});
});

function fakeEngine(id: string, configured: boolean, ok = true): TranslationProvider {
	return {
		id,
		label: id,
		isConfigured: () => configured,
		translate: ok
			? vi.fn().mockResolvedValue({ translation: `t-${id}`, engine: id })
			: vi.fn().mockRejectedValue(new Error(id)),
	};
}

describe('TranslationChain', () => {
	it('lists statuses in order and skips unconfigured engines', async () => {
		const chain = new TranslationChain([fakeEngine('deepl', false), fakeEngine('azure', true)]);
		expect(chain.statuses()).toEqual([
			{ id: 'deepl', label: 'deepl', configured: false },
			{ id: 'azure', label: 'azure', configured: true },
		]);
		const outcome = await chain.translateAndReport(REQUEST);
		expect(outcome?.provider.id).toBe('azure');
	});

	it('falls back when the first configured engine fails', async () => {
		const chain = new TranslationChain([
			fakeEngine('azure', true, false),
			fakeEngine('deepl', true),
		]);
		const outcome = await chain.translateAndReport(REQUEST);
		expect(outcome?.result.translation).toBe('t-deepl');
	});

	it('rejects when no engine can translate', async () => {
		const chain = new TranslationChain([fakeEngine('azure', false)]);
		await expect(chain.translate(REQUEST)).rejects.toThrow(/no configured translation engine/i);
	});
});

describe('BaiduTranslateProvider', () => {
	it('signs with md5(appid+q+salt+secret) and joins the results', async () => {
		let sent: HttpTextRequest | undefined;
		const provider = new BaiduTranslateProvider(
			() => ({ appId: 'app1', secret: 'sec1' }),
			async (req) => {
				sent = req;
				return {
					status: 200,
					text: JSON.stringify({
						from: 'en',
						to: 'zh',
						trans_result: [{ src: 'Hello', dst: '你好' }],
					}),
				};
			},
		);

		const result = await provider.translate(REQUEST);
		expect(result).toEqual({ translation: '你好', engine: 'baidu-translate' });

		const body = new URLSearchParams(sent?.body ?? '');
		expect(body.get('q')).toBe('hello');
		expect(body.get('from')).toBe('en');
		expect(body.get('to')).toBe('zh');
		expect(body.get('appid')).toBe('app1');
		const salt = body.get('salt') ?? '';
		expect(body.get('sign')).toBe(md5(`app1hello${salt}sec1`));
	});

	it('shortens language tags to their primary subtag', async () => {
		let sent: HttpTextRequest | undefined;
		const provider = new BaiduTranslateProvider(
			() => ({ appId: 'app1', secret: 'sec1' }),
			async (req) => {
				sent = req;
				return { status: 200, text: JSON.stringify({ trans_result: [{ dst: '你好' }] }) };
			},
		);
		await provider.translate({ word: 'hello', from: 'en-US', to: 'zh-CN' });
		const body = new URLSearchParams(sent?.body ?? '');
		expect(body.get('from')).toBe('en');
		expect(body.get('to')).toBe('zh');
	});

	it('is unconfigured without credentials', () => {
		expect(new BaiduTranslateProvider(() => null).isConfigured()).toBe(false);
	});

	it('surfaces the platform error code', async () => {
		const provider = new BaiduTranslateProvider(
			() => ({ appId: 'app1', secret: 'sec1' }),
			async () => ({ status: 200, text: JSON.stringify({ error_code: '54003' }) }),
		);
		await expect(provider.translate(REQUEST)).rejects.toThrow(/54003/);
	});
});

describe('orderTranslationEngines', () => {
	it('respects the stored order and appends unknown registry engines', () => {
		const azure = fakeEngine('azure-translate', true);
		const deepl = fakeEngine('deepl', true);
		const ordered = orderTranslationEngines([azure, deepl], ['deepl']);
		expect(ordered.map((p) => p.id)).toEqual(['deepl', 'azure-translate']);
	});
});
