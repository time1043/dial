/**
 * Tencent Cloud API 3.0 request signing (TC3-HMAC-SHA256), implemented
 * over the Web Crypto API so it runs in desktop and mobile webviews.
 *
 * Shared by the Tencent translator and speech providers — one Tencent
 * Cloud account's SecretId/SecretKey covers every service.
 */

export interface Tc3Credentials {
	secretId: string;
	secretKey: string;
}

export interface Tc3Request {
	/** Service endpoint host, e.g. `tmt.tencentcloudapi.com`. */
	host: string;
	/** Service name, e.g. `tmt` or `tts`. */
	service: string;
	action: string;
	version: string;
	/** JSON-serialized request body. */
	payload: string;
	/**
	 * Optional region. TC3 sends it as the `X-TC-Region` HTTP header, which
	 * is a common parameter (not part of canonical headers / SignedHeaders).
	 * TMT requires it; TTS does not. Default for new Tencent Cloud
	 * accounts is `ap-guangzhou`.
	 */
	region?: string;
}

const encoder = new TextEncoder();

function toHex(bytes: Uint8Array): string {
	return Array.from(bytes)
		.map((b) => b.toString(16).padStart(2, '0'))
		.join('');
}

async function sha256Hex(text: string): Promise<string> {
	const digest = await crypto.subtle.digest('SHA-256', encoder.encode(text));
	return toHex(new Uint8Array(digest));
}

async function hmacSha256(key: Uint8Array, message: string): Promise<Uint8Array> {
	const cryptoKey = await crypto.subtle.importKey(
		'raw',
		key as unknown as ArrayBuffer,
		{ name: 'HMAC', hash: 'SHA-256' },
		false,
		['sign'],
	);
	const signature = await crypto.subtle.sign('HMAC', cryptoKey, encoder.encode(message));
	return new Uint8Array(signature);
}

/**
 * Build the full header set for a signed Tencent Cloud POST, including
 * Authorization, X-TC-Action/Version/Timestamp, and Content-Type.
 */
export async function tc3SignedHeaders(
	request: Tc3Request,
	credentials: Tc3Credentials,
	now: () => Date = () => new Date(),
): Promise<Record<string, string>> {
	const timestamp = Math.floor(now().getTime() / 1000);
	const date = new Date(timestamp * 1000).toISOString().slice(0, 10);

	const canonicalRequest =
		`POST\n/\n\n` +
		`content-type:application/json; charset=utf-8\n` +
		`host:${request.host}\n\n` +
		`content-type;host\n` +
		(await sha256Hex(request.payload));

	const credentialScope = `${date}/${request.service}/tc3_request`;
	const stringToSign =
		`TC3-HMAC-SHA256\n${timestamp}\n${credentialScope}\n` + (await sha256Hex(canonicalRequest));

	const kDate = await hmacSha256(encoder.encode(`TC3${credentials.secretKey}`), date);
	const kService = await hmacSha256(kDate, request.service);
	const kSigning = await hmacSha256(kService, 'tc3_request');
	const signature = toHex(await hmacSha256(kSigning, stringToSign));

	const authorization =
		`TC3-HMAC-SHA256 Credential=${credentials.secretId}/${credentialScope}, ` +
		`SignedHeaders=content-type;host, Signature=${signature}`;

	const headers: Record<string, string> = {
		Authorization: authorization,
		'Content-Type': 'application/json; charset=utf-8',
		'X-TC-Action': request.action,
		'X-TC-Version': request.version,
		'X-TC-Timestamp': String(timestamp),
	};
	if (request.region) {
		headers['X-TC-Region'] = request.region;
	}
	return headers;
}
