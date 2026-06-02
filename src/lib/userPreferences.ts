const PREFS_KEY = "openstream_user_preferences";

export interface UserPreferences {
	/** Recording HUD control layout */
	trayLayout: "horizontal" | "vertical";
}

export const DEFAULT_PREFS: UserPreferences = {
	trayLayout: "horizontal",
};

/** Parses stored preferences without throwing on malformed JSON. */
function safeJsonParse(text: string | null): Record<string, unknown> | null {
	if (!text) return null;
	try {
		return JSON.parse(text);
	} catch {
		return null;
	}
}

/**
 * Load persisted user preferences from localStorage.
 * Returns defaults for any missing or invalid fields.
 */
export function loadUserPreferences(): UserPreferences {
	let raw: Record<string, unknown> | null = null;
	try {
		raw = safeJsonParse(localStorage.getItem(PREFS_KEY));
	} catch {
		return { ...DEFAULT_PREFS };
	}
	if (!raw || typeof raw !== "object") return { ...DEFAULT_PREFS };

	return {
		trayLayout:
			raw.trayLayout === "horizontal" || raw.trayLayout === "vertical"
				? raw.trayLayout
				: DEFAULT_PREFS.trayLayout,
	};
}

/**
 * Persist user preferences to localStorage.
 * Only the explicitly provided fields are updated.
 */
export function saveUserPreferences(partial: Partial<UserPreferences>): void {
	const current = loadUserPreferences();
	const merged = { ...current, ...partial };
	try {
		localStorage.setItem(PREFS_KEY, JSON.stringify(merged));
	} catch {
		// localStorage may be unavailable (e.g. private browsing quota exceeded)
	}
}
