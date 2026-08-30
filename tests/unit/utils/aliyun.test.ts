import { createHmac } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';

import type { RpcParams } from '@/utils/aliyun';
import type { HttpTextRequest, HttpTextResponse } from '@/utils/http';

import { createNlsTokenProvider, signAliyunRpc } from '@/utils/aliyun';

const CREDENTIALS = { accessKeyId: 'AKID', accessKeySecret: 'secret&' };
const FIXED_NOW = () => new Date('2026-08-23T12:00:00Z');

/** Independent POP/RPC reference implementation over node crypto. */
function referenceSignature(params: RpcParams): string {
	const special = (value: string) =>
		encodeURIComponent(value).replace(/\*/g, '%2A').replace(/%7E/g, '~');
	const canonical = Object.keys(params)
		.sort()
		.map((key) => `${special(key)}=${special(params[key] ?? '')}`)
		.join('&');
	const stringToSign = `GET&${special('/')}&${special(canonical)}`;
	return createHmac('sha1', `${CREDENTIALS.accessKeySecret}&`)
		.update(stringToSign)
		.digest('base64');
}

function tokenHttp(fixedToken = 'tok-1') {
	return async (_req: HttpTextRequest): Promise<HttpTextResponse> => ({
		status: 200,
		text: JSON.stringify({ Token: { Id: fixedToken, ExpireTime: 4102444800 } }),
	});
}

describe('signAliyunRpc', () => {
	it('matches a node-crypto reference HMAC-SHA1 implementation', async () => {
		const params: RpcParams = {
			Action: 'CreateToken',
			Format: 'JSON',
		};
		const signature = await signAliyunRpc(params, CREDENTIALS);
		expect(signature).toBe(referenceSignature(params));
	});
});

describe('createNlsTokenProvider', () => {
	it('requests CreateToken with the spec-mandated parameters and signature', async () => {
		const requests: HttpTextRequest[] = [];
		const provider = createNlsTokenProvider(
			() => CREDENTIALS,
			async (req) => {
				requests.push(req);
				return tokenHttp()(req);
			},
			FIXED_NOW,
		);

		const token = await provider.getToken();
		expect(token).toBe('tok-1');

		const url = new URL(requests[0]?.url ?? 'http://invalid');
		expect(url.origin + url.pathname).toBe('https://nls-meta.cn-shanghai.aliyuncs.com/');
		// API version and region are fixed by the NLS meta service.
		expect(url.searchParams.get('Version')).toBe('2019-02-28');
		expect(url.searchParams.get('RegionId')).toBe('cn-shanghai');
		expect(url.searchParams.get('Action')).toBe('CreateToken');
		// The timestamp must be UTC ISO8601, not an epoch number.
		expect(url.searchParams.get('Timestamp')).toBe('2026-08-23T12:00:00Z');
		// The sent signature must equal a reference computation over the
		// very params present in the URL.
		const sent: RpcParams = {};
		url.searchParams.forEach((value, key) => {
			sent[key] = value;
		});
		const sentSignature = sent.Signature ?? '';
		delete sent.Signature;
		expect(sentSignature).toBe(referenceSignature(sent));
	});

	it('caches the token until shortly before expiry', async () => {
		const http = vi.fn(tokenHttp());
		const provider = createNlsTokenProvider(() => CREDENTIALS, http, FIXED_NOW);

		await provider.getToken();
		await provider.getToken();
		// Token valid until 4102444800 (year 2100) — only one fetch.
		expect(http).toHaveBeenCalledTimes(1);
	});

	it('re-fetches once the cached token is inside the safety margin', async () => {
		// ExpireTime 10s in the future is within the 5-minute safety margin,
		// so every getToken must hit the endpoint again.
		const http = vi.fn(
			async (): Promise<HttpTextResponse> => ({
				status: 200,
				text: JSON.stringify({
					Token: {
						Id: 'tok-short',
						ExpireTime: Math.floor(FIXED_NOW().getTime() / 1000) + 10,
					},
				}),
			}),
		);
		const provider = createNlsTokenProvider(() => CREDENTIALS, http, FIXED_NOW);

		await provider.getToken();
		await provider.getToken();
		expect(http).toHaveBeenCalledTimes(2);
	});

	it('rejects with a clear error when credentials are missing', async () => {
		const provider = createNlsTokenProvider(
			() => ({ accessKeyId: ' ', accessKeySecret: '' }),
			tokenHttp(),
			FIXED_NOW,
		);
		await expect(provider.getToken()).rejects.toThrow(/not configured/i);
	});

	it('surfaces the API message when no token comes back', async () => {
		const provider = createNlsTokenProvider(
			() => CREDENTIALS,
			async () => ({ status: 200, text: JSON.stringify({ Message: 'InvalidAccessKeyId' }) }),
			FIXED_NOW,
		);
		await expect(provider.getToken()).rejects.toThrow(/InvalidAccessKeyId/);
	});
});
