import { ItemView, WorkspaceLeaf } from 'obsidian';

export const URL_PLAYER_VIEW_TYPE = 'dial-url-player';

/**
 * Plays a remote video (Bilibili, YouTube, etc.) by embedding its official
 * player in an iframe. This is Route A: simple, keeps the platform's native
 * player, but the video is cross-origin so we cannot read its playback time
 * or control it — subtitle sync, AB loop, and seek are unavailable here.
 *
 * Route B (future): a direct-link player that fetches the video stream,
 * muxes DASH, and injects WBI signature/Referer via a local proxy. It would
 * reuse all local-player features (subtitle sync, AB loop, seek). When
 * implemented, it should live as a separate view (e.g. DirectLinkPlayerView)
 * and be selected by the caller based on whether a direct link is available.
 */
export class UrlPlayerView extends ItemView {
	private embedUrl: string | null = null;

	constructor(leaf: WorkspaceLeaf) {
		super(leaf);
	}

	getViewType(): string {
		return URL_PLAYER_VIEW_TYPE;
	}

	getDisplayText(): string {
		return 'URL video player';
	}

	getIcon(): string {
		return 'play';
	}

	async onOpen(): Promise<void> {
		const container = this.containerEl.children[1];
		if (!container) return;
		container.empty();
		container.addClass('dial-url-player-container');
	}

	async onClose(): Promise<void> {
		this.embedUrl = null;
	}

	loadUrl(url: string): void {
		this.embedUrl = url;
		const container = this.containerEl.children[1] as HTMLElement | undefined;
		if (!container) return;
		container.empty();

		const iframe = container.createEl('iframe', {
			cls: 'dial-url-player-iframe',
		});
		iframe.setAttribute('src', url);
		iframe.setAttribute('frameborder', '0');
		iframe.setAttribute('scrolling', 'no');
		iframe.setAttribute('allowfullscreen', 'true');
		iframe.setAttribute(
			'allow',
			'autoplay; fullscreen; encrypted-media; picture-in-picture; web-share',
		);
	}

	getState(): Record<string, unknown> {
		return { embedUrl: this.embedUrl };
	}

	async setState(state: Record<string, unknown>): Promise<void> {
		const url = state['embedUrl'] as string | undefined;
		if (url) {
			this.loadUrl(url);
		}
	}
}
