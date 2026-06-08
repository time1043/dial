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

export interface TypeSentenceRecord {
	subtitleId: number;
	userInput: string[];
	correct: string[];
	completedAt: string | null;
}

export interface TypeSessionData {
	id: string;
	videoPath: string;
	subtitlePath: string;
	currentIndex: number;
	createdAt: string;
	sentences: TypeSentenceRecord[];
}
