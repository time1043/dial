/**
 * Convert common video watch URLs into their embeddable form.
 *
 * Embed URLs are required because the official player pages (e.g.
 * bilibili.com/video/BV...) are full web pages that may refuse to load inside
 * an iframe due to X-Frame-Options. The dedicated player / embed endpoints are
 * designed to be embedded.
 *
 * Unsupported hosts are returned unchanged so the iframe still renders the
 * original URL if the site permits embedding.
 */
export function toEmbedUrl(raw: string): string {
	const trimmed = raw.trim();
	if (!trimmed) return trimmed;

	let url: URL;
	try {
		url = new URL(trimmed);
	} catch {
		return trimmed;
	}

	const host = url.hostname;

	// Bilibili: https://www.bilibili.com/video/BVxxxx  →  embed player
	if (host.endsWith('bilibili.com')) {
		const bv = url.pathname.match(/\/video\/(BV[0-9A-Za-z]+)/);
		if (bv) {
			return `https://player.bilibili.com/player.html?bvid=${bv[1]}&autoplay=0&high_quality=1&danmaku=1`;
		}
		const b23 = url.pathname.match(/\/video\/(av\d+)/i);
		if (b23 && b23[1]) {
			return `https://player.bilibili.com/player.html?aid=${b23[1].slice(2)}&autoplay=0&high_quality=1&danmaku=1`;
		}
		return trimmed;
	}

	// YouTube: watch?v= → /embed/
	if (host.endsWith('youtube.com')) {
		const v = url.searchParams.get('v');
		if (v) {
			return `https://www.youtube.com/embed/${v}`;
		}
		return trimmed;
	}
	if (host === 'youtu.be') {
		const id = url.pathname.slice(1);
		if (id) {
			return `https://www.youtube.com/embed/${id}`;
		}
		return trimmed;
	}

	return trimmed;
}
