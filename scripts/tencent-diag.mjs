#!/usr/bin/env node
// Standalone Tencent Cloud diagnostic for the Dial Obsidian plugin.
//
// Reproduces the EXACT TC3-HMAC-SHA256 signing logic from src/utils/tc3.ts
// (ported from Web Crypto to node:crypto) and calls the same two endpoints
// the plugin uses:
//   - TMT TextTranslate   (translation)
//   - TTS TextToVoice     (speech)
// It prints the raw HTTP status + full body so the real
// Response.Error.Code / Message surfaces — instead of being swallowed by
// TranslationChain's empty catch{}.
//
// Usage (bash):
//   TENCENT_SECRET_ID=AKID... TENCENT_SECRET_KEY=... node scripts/tencent-diag.mjs
//
// The plugin stores secretId trimmed but secretKey RAW (settings.ts:847 vs 859),
// so this script also reports whether the key carries whitespace and runs the
// call BOTH with the raw value (matching the plugin) and a trimmed value,
// to expose that asymmetry as a failure cause.
//
// Requires: Node >= 18 (global fetch). No deps.

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const toHex = (b) =>
	Array.from(b)
		.map((x) => x.toString(16).padStart(2, '0'))
		.join('');
const sha256Hex = (s) => crypto.createHash('sha256').update(s, 'utf8').digest('hex');
const hmacSha256 = (key, msg) => crypto.createHmac('sha256', key).update(msg, 'utf8').digest();

/**
 * Port of tc3SignedHeaders() in src/utils/tc3.ts — byte-for-byte identical
 * canonical request / string-to-sign / derived-key chain. If Tencent
 * accepts signatures from this, the plugin's signing is correct and the
 * failure is account/permission/service-activation, not crypto.
 */
function tc3SignedHeaders(
	{ host, service, action, version, payload, region },
	{ secretId, secretKey },
) {
	const now = new Date();
	const timestamp = Math.floor(now.getTime() / 1000);
	const date = new Date(timestamp * 1000).toISOString().slice(0, 10);

	const canonicalRequest =
		`POST\n/\n\n` +
		`content-type:application/json; charset=utf-8\n` +
		`host:${host}\n\n` +
		`content-type;host\n` +
		sha256Hex(payload);

	const credentialScope = `${date}/${service}/tc3_request`;
	const stringToSign =
		`TC3-HMAC-SHA256\n${timestamp}\n${credentialScope}\n` + sha256Hex(canonicalRequest);

	const kDate = hmacSha256(Buffer.from(`TC3${secretKey}`, 'utf8'), date);
	const kService = hmacSha256(kDate, service);
	const kSigning = hmacSha256(kService, 'tc3_request');
	const signature = toHex(hmacSha256(kSigning, stringToSign));

	const authorization =
		`TC3-HMAC-SHA256 Credential=${secretId}/${credentialScope}, ` +
		`SignedHeaders=content-type;host, Signature=${signature}`;

	const headers = {
		Authorization: authorization,
		'Content-Type': 'application/json; charset=utf-8',
		'X-TC-Action': action,
		'X-TC-Version': version,
		'X-TC-Timestamp': String(timestamp),
	};
	if (region) headers['X-TC-Region'] = region;
	return headers;
}

async function call(label, creds, { host, service, action, version, payload, region }) {
	const headers = tc3SignedHeaders({ host, service, action, version, payload, region }, creds);
	console.log(`\n===== ${label} =====`);
	console.log(`endpoint: https://${host}`);
	console.log(`action=${action} version=${version}`);
	console.log(`payload: ${payload}`);
	const t0 = Date.now();
	let res;
	try {
		res = await fetch(`https://${host}`, {
			method: 'POST',
			headers,
			body: payload,
		});
	} catch (e) {
		console.log(
			`NETWORK ERROR (request never left the machine / DNS / proxy): ${e?.message ?? e}`,
		);
		return;
	}
	const ms = Date.now() - t0;
	const text = await res.text();
	console.log(`HTTP ${res.status}  (${ms} ms)`);
	// Pretty-print JSON if possible, else raw.
	try {
		console.log(JSON.stringify(JSON.parse(text), null, 2));
	} catch {
		console.log(text);
	}
	// Surface the Tencent error code prominently.
	try {
		const j = JSON.parse(text);
		const code = j?.Response?.Error?.Code;
		const msg = j?.Response?.Error?.Message;
		const reqId = j?.Response?.RequestId;
		if (code) console.log(`>>> Tencent Error.Code = ${code}`);
		if (msg) console.log(`>>> Tencent Error.Message = ${msg}`);
		if (reqId) console.log(`>>> RequestId = ${reqId}  (give this to Tencent support)`);
	} catch {
		/* not JSON */
	}
}

function describeCreds(id, key, tag) {
	const idWs = id !== id.trim();
	const keyWs = key !== key.trim();
	console.log(`\n----- credentials (${tag}) -----`);
	console.log(`secretId  len=${id.length}  hasLeadTrailWhitespace=${idWs}`);
	console.log(`secretKey len=${key.length}  hasLeadTrailWhitespace=${keyWs}`);
	if (keyWs) {
		console.log(`  !!! secretKey has leading/trailing whitespace.`);
		console.log(
			`  !!! Plugin stores secretKey RAW (settings.ts:859) but trims secretId (settings.ts:847).`,
		);
		console.log(
			`  !!! A key pasted with a stray space WILL break TC3 signing with AuthFailure.SignatureFailure.`,
		);
	}
}

(async () => {
	let secretId = process.env.TENCENT_SECRET_ID ?? '';
	let secretKey = process.env.TENCENT_SECRET_KEY ?? '';

	// Optional: read from an Obsidian vault plugin data.json on disk.
	//   TENCENT_VAULT=<vault-root> node scripts/tencent-diag.mjs
	if (process.env.TENCENT_VAULT) {
		const dataPath = path.join(process.env.TENCENT_VAULT, '.obsidian/plugins/dial/data.json');
		try {
			const raw = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
			secretId = secretId || raw.tencentSecretId || '';
			secretKey = secretKey || raw.tencentSecretKey || '';
			console.log(`loaded credentials from ${dataPath}`);
		} catch (e) {
			console.log(`could not read ${dataPath}: ${e.message}`);
		}
	}

	if (!secretId || !secretKey) {
		console.log(
			`Set TENCENT_SECRET_ID and TENCENT_SECRET_KEY (env) or TENCENT_VAULT=<vault-root>.`,
		);
		process.exit(2);
	}

	const word = process.env.TENCENT_WORD || 'hello';

	// --- Pass A: sign with the RAW values, exactly like the plugin ---
	describeCreds(secretId, secretKey, 'raw (matches plugin behaviour)');
	await call(
		'TMT TextTranslate (raw)',
		{ secretId, secretKey },
		{
			host: 'tmt.tencentcloudapi.com',
			service: 'tmt',
			action: 'TextTranslate',
			version: '2018-03-21',
			region: 'ap-guangzhou',
			payload: JSON.stringify({ SourceText: word, Source: 'en', Target: 'zh', ProjectId: 0 }),
		},
	);
	await call(
		'TTS TextToVoice (raw)',
		{ secretId, secretKey },
		{
			host: 'tts.tencentcloudapi.com',
			service: 'tts',
			action: 'TextToVoice',
			version: '2019-08-23',
			payload: JSON.stringify({
				Text: word,
				SessionId: `${Date.now()}-diag`,
				VoiceType: 1051,
				Codec: 'mp3',
				SampleRate: 16000,
				ModelType: 1,
				PrimaryLanguage: 2,
			}),
		},
	);

	// --- Pass B: same call with trimmed values, to test the whitespace theory ---
	if (secretId !== secretId.trim() || secretKey !== secretKey.trim()) {
		const id = secretId.trim();
		const key = secretKey.trim();
		describeCreds(id, key, 'trimmed (for comparison)');
		await call(
			'TMT TextTranslate (trimmed)',
			{ secretId: id, secretKey: key },
			{
				host: 'tmt.tencentcloudapi.com',
				service: 'tmt',
				action: 'TextTranslate',
				version: '2018-03-21',
				region: 'ap-guangzhou',
				payload: JSON.stringify({
					SourceText: word,
					Source: 'en',
					Target: 'zh',
					ProjectId: 0,
				}),
			},
		);
	}
})();
