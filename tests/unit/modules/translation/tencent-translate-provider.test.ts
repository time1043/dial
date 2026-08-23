import { Buffer } from 'node:buffer';
import { createHash, createHmac } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';

import type { HttpTextRequest, HttpTextResponse } from '@/utils/http';

import { TencentTranslateProvider } from '@/modules/translation/tencent-translate-provider';
import { tc3SignedHeaders } from '@/utils/tc3';

const FIXED_NOW = () => new Date('2026-08-23T12:00:00Z');
const CREDENTIALS = { secretId: 'AKIDtest', secretKey: 'Gu5tKey' };
const REQUEST = { word: 'hello', from: 'en', to: 'zh' };

/** Independent TC3 reference implementation over node crypto. */
function referenceAuthorization(payload: string): string {
	const timestamp = Math.floor(FIXED_NOW().getTime() / 1000);
	const date = new Date(timestamp * 1000).toISOString().slice(0, 10);
	const sha256 = (text: string) => createHash('sha256').update(text).digest('hex');
	const canonicalRequest =
		`POST\n/\n\ncontent-type:application/json; charset=utf-8\nhost:tmt.tencentcloudapi.com\n\n` +
		`content-type;host\n${sha256(payload)}`;
	const scope = `${date}/tmt/tc3_request`;
	const stringToSign = `TC3-HMAC-SHA256\n${timestamp}\n${scope}\n${sha256(canonicalRequest)}`;
	const hmac = (key: Buffer | string, message: string) =>
		createHmac('sha256', key).update(message).digest();
	const kDate = hmac(`TC3${CREDENTIALS.secretKey}`, date);
	const kService = hmac(kDate, 'tmt');
	const kSigning = hmac(kService, 'tc3_request');
	const signature = hmac(kSigning, stringToSign).toString('hex');
	return (
		`TC3-HMAC-SHA256 Credential=${CREDENTIALS.secretId}/${scope}, ` +
		`SignedHeaders=content-type;host, Signature=${signature}`
	);
}

describe('tc3SignedHeaders', () => {
	it('produces the same signature as a node-crypto reference implementation', async () => {
		const payload = JSON.stringify({
			SourceText: 'hello',
			Source: 'en',
			Target: 'zh',
			ProjectId: 0,
		});
		const headers = await tc3SignedHeaders(
			{
				host: 'tmt.tencentcloudapi.com',
				service: 'tmt',
				action: 'TextTranslate',
				version: '2018-03-21',
				payload,
			},
			CREDENTIALS,
			FIXED_NOW,
		);
		expect(headers.Authorization).toBe(referenceAuthorization(payload));
		expect(headers['X-TC-Action']).toBe('TextTranslate');
		expect(headers['X-TC-Version']).toBe('2018-03-21');
		expect(headers['X-TC-Timestamp']).toBe(String(Math.floor(FIXED_NOW().getTime() / 1000)));
	});
});

describe('TencentTranslateProvider', () => {
	it('sends a signed TextTranslate request and extracts TranslatedText', async () => {
		const requests: HttpTextRequest[] = [];
		const provider = new TencentTranslateProvider(
			() => CREDENTIALS,
			async (req): Promise<HttpTextResponse> => {
				requests.push(req);
				return {
					status: 200,
					text: JSON.stringify({ Response: { TranslatedText: '你好' } }),
				};
			},
		);

		const result = await provider.translate(REQUEST);
		expect(result).toEqual({ translation: '你好', engine: 'tencent-translate' });

		const sent = requests[0];
		expect(sent?.url).toBe('https://tmt.tencentcloudapi.com');
		expect(sent?.headers?.Authorization).toContain(`Credential=${CREDENTIALS.secretId}/`);
		expect(sent?.headers?.['X-TC-Action']).toBe('TextTranslate');
		expect(JSON.parse(sent?.body ?? '{}')).toEqual({
			SourceText: 'hello',
			Source: 'en',
			Target: 'zh',
			ProjectId: 0,
		});
	});

	it('is unconfigured with empty credentials', () => {
		expect(
			new TencentTranslateProvider(() => ({ secretId: ' ', secretKey: ' ' })).isConfigured(),
		).toBe(false);
	});

	it('surfaces API error codes', async () => {
		const provider = new TencentTranslateProvider(
			() => CREDENTIALS,
			async () => ({
				status: 200,
				text: JSON.stringify({ Response: { Error: { Code: 'AuthFailure' } } }),
			}),
		);
		await expect(provider.translate(REQUEST)).rejects.toThrow(/AuthFailure/);
	});

	it('is skipped by the chain when not configured', () => {
		const provider = new TencentTranslateProvider(() => null);
		const unused = vi.fn();
		expect(provider.isConfigured()).toBe(false);
		expect(unused).not.toHaveBeenCalled();
	});
});
