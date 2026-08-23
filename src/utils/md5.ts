/**
 * Pure-JS MD5 (RFC 1321) over UTF-8 bytes.
 *
 * The Web Crypto API deliberately omits MD5 and Node's crypto module is
 * unavailable on mobile webviews, but Baidu's translate API signs
 * requests with MD5 — so here is a compact dependency-free port.
 * Verified against the standard test vectors in md5.test.ts.
 */

const S = [
	7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9,
	14, 20, 5, 9, 14, 20, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 6, 10, 15, 21,
	6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21,
];

const K = new Uint32Array(64);
for (let i = 0; i < 64; i++) {
	K[i] = Math.floor(Math.abs(Math.sin(i + 1)) * 4294967296);
}

function leftRotate(value: number, shift: number): number {
	return (value << shift) | (value >>> (32 - shift));
}

/** Process one 64-byte block (16 little-endian words) into the state. */
function md5block(state: Uint32Array, block: Uint32Array): void {
	// noUncheckedIndexedAccess: index reads yield number|undefined, but
	// callers always pass 4-word states and 16-word blocks.
	const a0 = state[0] ?? 0;
	const b0 = state[1] ?? 0;
	const c0 = state[2] ?? 0;
	const d0 = state[3] ?? 0;
	let a = a0;
	let b = b0;
	let c = c0;
	let d = d0;

	for (let i = 0; i < 64; i++) {
		let f: number;
		let g: number;
		if (i < 16) {
			f = (b & c) | (~b & d);
			g = i;
		} else if (i < 32) {
			f = (d & b) | (~d & c);
			g = (5 * i + 1) % 16;
		} else if (i < 48) {
			f = b ^ c ^ d;
			g = (3 * i + 5) % 16;
		} else {
			f = c ^ (b | ~d);
			g = (7 * i) % 16;
		}
		const tmp = d;
		d = c;
		c = b;
		const sum = (a + f + (K[i] ?? 0) + (block[g] ?? 0)) | 0;
		b = (b + leftRotate(sum, S[i] ?? 0)) | 0;
		a = tmp;
	}

	state[0] = (a0 + a) | 0;
	state[1] = (b0 + b) | 0;
	state[2] = (c0 + c) | 0;
	state[3] = (d0 + d) | 0;
}

export function md5(input: string): string {
	return md5Bytes(new TextEncoder().encode(input));
}

export function md5Bytes(bytes: Uint8Array): string {
	// Pad: append 0x80, zeros, then the 64-bit little-endian bit length.
	const bitLength = bytes.length * 8;
	const paddedLength = (((bytes.length + 8) >>> 6) + 1) << 6;
	const padded = new Uint8Array(paddedLength);
	padded.set(bytes);
	padded[bytes.length] = 0x80;
	const view = new DataView(padded.buffer);
	view.setUint32(paddedLength - 8, bitLength >>> 0, true);
	view.setUint32(paddedLength - 4, Math.floor(bitLength / 4294967296), true);

	const state = new Uint32Array([0x67452301, 0xefcdab89, 0x98badcfe, 0x10325476]);
	const block = new Uint32Array(16);
	for (let offset = 0; offset < paddedLength; offset += 64) {
		for (let i = 0; i < 16; i++) {
			block[i] = view.getUint32(offset + i * 4, true);
		}
		md5block(state, block);
	}

	const hex = new Array<string>(16);
	const stateView = new DataView(state.buffer);
	for (let i = 0; i < 16; i++) {
		hex[i] = stateView.getUint8(i).toString(16).padStart(2, '0');
	}
	return hex.join('');
}
