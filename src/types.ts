export interface Subtitle {
	id: number;
	start: number; // seconds
	end: number; // seconds
	text: string;
}

export interface ABLoopState {
	a: number | null;
	b: number | null;
	active: boolean;
}
