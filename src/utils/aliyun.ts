import type { HttpFn } from '@/utils/http';

export interface AliyunCredentials {
	accessKeyId: string;
	accessKeySecret: string;
}

/**
 * Aliyun POP/RPC percent-encoding (RFC 3986 with three fixed swaps).
 * Mirrors the official SDK `specialUrlEncode`: space → %20, `*` → %2A,
 * and `~` stays literal (decoded back from %7E).
 */
function specialUrlEncode(value: string): string {
	return encodeURIComponent(value)
		.replace(/\*/g, '%2A')
		.replace(/\+/g, '%20')
		.replace(/%7E/g, '~');
}

/** RFC 2104 HMAC-SHA1 over the Web Crypto API, returns raw bytes. */
async function hmacSha1(key: string, message: string): Promise<Uint8Array> {
	const cryptoKey = await crypto.subtle.importKey(
		'raw',
		new TextEncoder().encode(key),
		{ name: 'HMAC', hash: 'SHA-1' },
		false,
		['sign'],
	);
	const signature = await crypto.subtle.sign('HMAC', cryptoKey, new TextEncoder().encode(message));
	return new Uint8Array(signature);
}

function bytesToBase64(bytes: Uint8Array): string {
	let binary = '';
	for (let i = 0; i < bytes.length; i++) {
		binary += String.fromCharCode(bytes[i] as number);
	}
	return btoa(binary);
}

/**
 * The full set of params that sign a request, EXCLUDING the Signature
 * itself (which is computed from them).
 */
export type RpcParams = Record<string, string>;

/**
 * Compute the Aliyun POP/RPC `Signature` (HMAC-SHA1, base64) for a GET
 * request. The caller percent-encodes the returned value into the query
 * string alongside the other params.
 */
export async function signAliyunRpc(
	params: RpcParams,
	credentials: AliyunCredentials,
): Promise<string> {
	const sortedKeys = Object.keys(params).sort();
	const canonical = sortedKeys
		.map((key) => `${specialUrlEncode(key)}=${specialUrlEncode(params[key] ?? '')}`)
		.join('&');
	const stringToSign = `GET&${specialUrlEncode('/')}&${specialUrlEncode(canonical)}`;
	const signature = await hmacSha1(`${credentials.accessKeySecret}&`, stringToSign);
	return bytesToBase64(signature);
}

export interface NlsToken {
	id: string;
	/** Unix timestamp (seconds) when the token stops being valid. */
	expireTime: number;
}

export interface NlsTokenProvider {
	getToken(): Promise<string>;
}

/**
 * Fetches and caches an Alibaba NLS access token (used to authenticate the
 * speech service). Tokens live for hours, so we keep one in memory and only
 * re-request it after expiry (with a 5-minute safety margin) or on failure.
 *
 * The token endpoint uses the POP/RPC signature above.
 */
export function createNlsTokenProvider(
	getCredentials: () => AliyunCredentials | null,
	http: HttpFn,
	now: () => Date = () => new Date(),
): NlsTokenProvider {
	let cached: NlsToken | null = null;

	async function fetchToken(): Promise<NlsToken> {
		const credentials = getCredentials();
		if (!credentials || !credentials.accessKeyId.trim() || !credentials.accessKeySecret.trim()) {
			throw new Error('alibaba cloud is not configured');
		}
		const timestamp = Math.floor(now().getTime() / 1000);
		const params: RpcParams = {
			Action: 'CreateToken',
			Version: '2018-05-18',
			AccessKeyId: credentials.accessKeyId,
			Timestamp: String(timestamp),
			Format: 'JSON',
			SignatureMethod: 'HMAC-SHA1',
			SignatureVersion: '1.0',
			SignatureNonce: `${timestamp}-${Math.random().toString(36).slice(2)}`,
		};
		params.Signature = await signAliyunRpc(params, credentials);

		const query = Object.entries(params)
			.map(([key, value]) => `${specialUrlEncode(key)}=${specialUrlEncode(value)}`)
			.join('&');

		const response = await http({
			url: `https://nls-meta.cn-shanghai.aliyuncs.com/?${query}`,
			method: 'GET',
		});
		if (response.status !== 200) {
			throw new Error(`alibaba token request failed (${response.status})`);
		}
		const data = JSON.parse(response.text) as {
			Token?: { Id?: string; ExpireTime?: number };
			Message?: string;
		};
		if (!data.Token?.Id) {
			throw new Error(`alibaba token error: ${data.Message ?? 'no token returned'}`);
		}
		return { id: data.Token.Id, expireTime: data.Token.ExpireTime ?? 0 };
	}

	return {
		async getToken(): Promise<string> {
			const seconds = Math.floor(now().getTime() / 1000);
			if (cached && cached.expireTime > seconds + 300) {
				return cached.id;
			}
			cached = await fetchToken();
			return cached.id;
		},
	};
}
