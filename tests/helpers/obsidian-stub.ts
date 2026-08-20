// Minimal runtime stub for the `obsidian` npm package.
//
// The real `obsidian` package is types-only (`main: ""`) — it provides
// `obsidian.d.ts` for the editor but no runtime entry. Source modules import
// values from it (`Notice`, `TFile`, `setIcon`, ...), so under vitest those
// imports would fail to resolve.
//
// vitest.config.ts aliases `obsidian` → this file in both projects, so any
// transitively-imported obsidian value resolves to a no-op stub. Tests that
// need specific behavior can still override with `vi.mock('obsidian', ...)`
// (the mock factory takes precedence over the alias).

export class Notice {
	constructor(_message?: unknown) {}
}

export class TFile {
	path = '';
}

export class TFolder {
	path = '';
}

export class Plugin {}

export class ItemView {
	containerEl: HTMLElement =
		typeof document !== 'undefined' ? document.createElement('div') : ({} as HTMLElement);
	registerEvent() {}
	registerDomEvent() {}
	registerInterval() {}
}

export class WorkspaceLeaf {}

export class Setting {
	constructor(_container: HTMLElement) {}
	setName() {
		return this;
	}
	setDesc() {
		return this;
	}
	addText() {
		return this;
	}
	addSlider() {
		return this;
	}
	addDropdown() {
		return this;
	}
}

export class PluginSettingTab {
	constructor(_app: unknown, _plugin: unknown) {}
}

export function setIcon(_el: HTMLElement, _icon: string): void {}
