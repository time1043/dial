import { requestUrl } from 'obsidian';

/**
 * Minimal injectable HTTP port for cloud providers.
 *
 * The real implementation wraps Obsidian's requestUrl, which is the
 * blessed way to call external APIs (it bypasses CORS on desktop and
 * mobile). Providers take an HttpFn so tests inject fakes instead.
 */
export interface HttpTextRequest {
	url: string;
	method?: string;
	headers?: Record<string, string>;
	body?: string;
}

export interface HttpTextResponse {
	status: number;
	/** Body as text (JSON APIs, error pages). */
	text: string;
	/** Body as bytes when the endpoint returns audio/binary data. */
	arrayBuffer?: ArrayBuffer;
}

export type HttpFn = (request: HttpTextRequest) => Promise<HttpTextResponse>;

export function obsidianHttp(request: HttpTextRequest): Promise<HttpTextResponse> {
	return requestUrl({ ...request, throw: false }).then((response) => ({
		status: response.status,
		text: response.text,
		arrayBuffer: response.arrayBuffer,
	}));
}
