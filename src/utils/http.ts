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
	text: string;
}

export type HttpFn = (request: HttpTextRequest) => Promise<HttpTextResponse>;

export function obsidianHttp(request: HttpTextRequest): Promise<HttpTextResponse> {
	return requestUrl({ ...request, throw: false }).then((response) => ({
		status: response.status,
		text: response.text,
	}));
}
