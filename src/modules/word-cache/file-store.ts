import { TFile, TFolder, type Vault } from 'obsidian';

/**
 * Minimal filesystem port the caches run on. The real implementation
 * wraps the Obsidian Vault API; tests inject an in-memory store, which
 * keeps the tier/promotion logic testable outside Obsidian.
 */
export interface CacheFileStore {
	exists(path: string): Promise<boolean>;
	/** Creates the folder and any missing parent levels. */
	mkdir(path: string): Promise<void>;
	/** Names of the children of a folder (files and folders); [] if missing. */
	list(path: string): Promise<string[]>;
	read(path: string): Promise<string>;
	write(path: string, text: string): Promise<void>;
	/** Appends text to a file, creating it (but not folders) if missing. */
	append(path: string, text: string): Promise<void>;
	readBinary(path: string): Promise<ArrayBuffer>;
	writeBinary(path: string, data: ArrayBuffer): Promise<void>;
	rename(from: string, to: string): Promise<void>;
	/** Removes a file or an empty folder. */
	remove(path: string): Promise<void>;
}

export class VaultCacheFileStore implements CacheFileStore {
	constructor(private readonly vault: Vault) {}

	async exists(path: string): Promise<boolean> {
		return this.vault.getAbstractFileByPath(path) !== null;
	}

	/** Creates the folder and any missing parent levels. */
	async mkdir(path: string): Promise<void> {
		const parts = path.split('/').filter(Boolean);
		let current = '';
		for (const part of parts) {
			current = current ? `${current}/${part}` : part;
			if (!(await this.exists(current))) {
				await this.vault.createFolder(current);
			}
		}
	}

	async list(path: string): Promise<string[]> {
		const entry = this.vault.getAbstractFileByPath(path);
		if (!(entry instanceof TFolder)) return [];
		return entry.children.map((child) => child.name);
	}

	async read(path: string): Promise<string> {
		const file = this.vault.getAbstractFileByPath(path);
		if (!(file instanceof TFile)) throw new Error(`cache file not found: ${path}`);
		return this.vault.read(file);
	}

	async write(path: string, text: string): Promise<void> {
		const file = this.vault.getAbstractFileByPath(path);
		if (file instanceof TFile) {
			await this.vault.modify(file, text);
		} else {
			await this.vault.create(path, text);
		}
	}

	async append(path: string, text: string): Promise<void> {
		await this.vault.adapter.append(path, text);
	}

	async readBinary(path: string): Promise<ArrayBuffer> {
		const file = this.vault.getAbstractFileByPath(path);
		if (!(file instanceof TFile)) throw new Error(`cache file not found: ${path}`);
		return this.vault.readBinary(file);
	}

	async writeBinary(path: string, data: ArrayBuffer): Promise<void> {
		const file = this.vault.getAbstractFileByPath(path);
		if (file instanceof TFile) {
			await this.vault.modifyBinary(file, data);
		} else {
			await this.vault.createBinary(path, data);
		}
	}

	async rename(from: string, to: string): Promise<void> {
		const file = this.vault.getAbstractFileByPath(from);
		if (!file) throw new Error(`cache file not found: ${from}`);
		await this.vault.rename(file, to);
	}

	async remove(path: string): Promise<void> {
		const file = this.vault.getAbstractFileByPath(path);
		if (!file) return;
		await this.vault.delete(file);
	}
}
