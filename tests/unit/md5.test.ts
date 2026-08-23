import { describe, expect, it } from 'vitest';

import { md5 } from '@/utils/md5';

describe('md5', () => {
	it('matches the RFC 1321 test vectors', () => {
		expect(md5('')).toBe('d41d8cd98f00b204e9800998ecf8427e');
		expect(md5('a')).toBe('0cc175b9c0f1b6a831c399e269772661');
		expect(md5('abc')).toBe('900150983cd24fb0d6963f7d28e17f72');
		expect(md5('message digest')).toBe('f96b697d7cb7938d525a2f31aaf161d0');
		expect(md5('abcdefghijklmnopqrstuvwxyz')).toBe('c3fcd3d76192e4007dfb496cca67e13b');
		expect(md5('ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789')).toBe(
			'd174ab98d277d9f5a5611c2c9f419d9f',
		);
		expect(
			md5('12345678901234567890123456789012345678901234567890123456789012345678901234567890'),
		).toBe('57edf4a22be3c955ac49da2e2107b67a');
	});

	it('hashes UTF-8 multibyte input correctly', () => {
		// Vectors generated with node's crypto (md5 over UTF-8 bytes).
		expect(md5('€')).toBe('bca53fde466a76b7bee3e18997e94a7a');
		expect(md5('你好')).toBe('7eca689f0d3389d9dea66ae112e5cfd7');
	});
});
