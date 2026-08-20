/**
 * Polyfill for Obsidian's HTMLElement extensions.
 *
 * The `obsidian` npm package ships type definitions only (its `main` is the
 * empty string). At runtime inside Obsidian it augments `HTMLElement.prototype`
 * with helpers — createDiv / createSpan / createEl / empty / addClass /
 * removeClass / toggleClass / hasClass / setCssProps. These do NOT exist on a
 * plain HTMLElement, so any Dial UI controller (which calls e.g.
 * `parent.createDiv({ cls: '...' })`) would throw in vitest browser mode.
 *
 * Loaded via the browser project's `setupFiles`. Behaviour mirrors the
 * Obsidian runtime closely enough for rendering/interaction assertions; it is
 * NOT a full reimplementation — extend as tests exercise more surface.
 */

interface DomElementInfo {
	cls?: string | string[];
	text?: string;
	attr?: Record<string, string | number | boolean | null>;
	type?: string;
	placeholder?: string;
	title?: string;
	value?: string;
	href?: string;
	prepend?: boolean;
}

declare global {
	interface HTMLElement {
		createDiv(
			o?: DomElementInfo | string,
			callback?: (el: HTMLDivElement) => void,
		): HTMLDivElement;
		createEl<K extends keyof HTMLElementTagNameMap>(
			tag: K,
			o?: DomElementInfo | string,
			callback?: (el: HTMLElementTagNameMap[K]) => void,
		): HTMLElementTagNameMap[K];
		createSpan(
			o?: DomElementInfo | string,
			callback?: (el: HTMLSpanElement) => void,
		): HTMLSpanElement;
		empty(): void;
		addClass(...classes: string[]): void;
		removeClass(...classes: string[]): void;
		toggleClass(classes: string | string[], value: boolean): void;
		hasClass(cls: string): boolean;
		setCssProps(props: Record<string, string>): void;
	}
}

function resolveOpts(o?: DomElementInfo | string): DomElementInfo {
	if (typeof o === 'string') return { cls: o };
	return o ?? {};
}

function applyOpts(el: HTMLElement, o: DomElementInfo): void {
	if (o.cls !== undefined) {
		const classes = Array.isArray(o.cls) ? o.cls : o.cls.split(/\s+/).filter(Boolean);
		for (const c of classes) el.classList.add(c);
	}
	if (o.text !== undefined) el.textContent = o.text;
	if (o.attr) {
		for (const [k, v] of Object.entries(o.attr)) {
			if (v === null || v === false) el.removeAttribute(k);
			else el.setAttribute(k, String(v));
		}
	}
	if (o.title !== undefined) el.setAttribute('title', o.title);
	if (o.placeholder !== undefined) el.setAttribute('placeholder', o.placeholder);
	if (o.value !== undefined) (el as HTMLInputElement).value = o.value;
	if (o.href !== undefined) el.setAttribute('href', o.href);
}

function insert(el: HTMLElement, parent: HTMLElement, prepend?: boolean): void {
	if (prepend) parent.prepend(el);
	else parent.appendChild(el);
}

HTMLElement.prototype.createDiv = function (o, callback) {
	const opts = resolveOpts(o);
	const el = document.createElement('div');
	applyOpts(el, opts);
	insert(el, this, opts.prepend);
	callback?.(el);
	return el;
};

HTMLElement.prototype.createEl = function (tag, o, callback) {
	const opts = resolveOpts(o);
	const el = document.createElement(tag);
	applyOpts(el, opts);
	if (opts.type && tag === 'input') (el as HTMLInputElement).type = opts.type;
	insert(el, this, opts.prepend);
	callback?.(el);
	return el;
};

HTMLElement.prototype.createSpan = function (o, callback) {
	const opts = resolveOpts(o);
	const el = document.createElement('span');
	applyOpts(el, opts);
	insert(el, this, opts.prepend);
	callback?.(el);
	return el;
};

HTMLElement.prototype.empty = function () {
	while (this.firstChild) this.removeChild(this.firstChild);
};

HTMLElement.prototype.addClass = function (...classes) {
	for (const c of classes) this.classList.add(c);
};

HTMLElement.prototype.removeClass = function (...classes) {
	for (const c of classes) this.classList.remove(c);
};

HTMLElement.prototype.toggleClass = function (classes, value) {
	const list = Array.isArray(classes) ? classes : [classes];
	for (const c of list) this.classList.toggle(c, value);
};

HTMLElement.prototype.hasClass = function (cls) {
	return this.classList.contains(cls);
};

HTMLElement.prototype.setCssProps = function (props) {
	for (const [k, v] of Object.entries(props)) {
		if (k.startsWith('--')) this.style.setProperty(k, v);
		else (this.style as unknown as Record<string, string>)[k] = v;
	}
};

export {};
