import type { LiveStreamDestinationProvider, LiveStreamLayout } from "@/lib/liveStream";
import { DEFAULT_LIVE_STREAM_LAYOUT } from "@/lib/liveStream";

export const LAUNCH_PREFERENCES_STORAGE_KEY = "openstream_launch_preferences";

interface StoredLaunchPreferences {
	version: 1;
	destinationProvider?: LiveStreamDestinationProvider;
	rtmpServerUrl?: string;
	selectedSource?: {
		id: string;
		displayId: string;
	};
	systemAudioEnabled?: boolean;
	microphoneEnabled?: boolean;
	microphoneDeviceId?: string;
	webcamEnabled?: boolean;
	webcamDeviceId?: string;
	liveStreamLayout?: LiveStreamLayout;
}

export interface LaunchPreferences {
	destinationProvider: LiveStreamDestinationProvider | null;
	rtmpServerUrl: string | null;
	selectedSource: {
		id: string;
		displayId: string;
	} | null;
	systemAudioEnabled: boolean | null;
	microphoneEnabled: boolean | null;
	microphoneDeviceId: string | null;
	webcamEnabled: boolean | null;
	webcamDeviceId: string | null;
	liveStreamLayout: LiveStreamLayout | null;
}

export type LaunchPreferencesPatch = Partial<LaunchPreferences>;

const EMPTY_LAUNCH_PREFERENCES: LaunchPreferences = {
	destinationProvider: null,
	rtmpServerUrl: null,
	selectedSource: null,
	systemAudioEnabled: null,
	microphoneEnabled: null,
	microphoneDeviceId: null,
	webcamEnabled: null,
	webcamDeviceId: null,
	liveStreamLayout: null,
};

function isObject(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readString(value: unknown): string | null {
	return typeof value === "string" && value.trim() ? value : null;
}

function readBoolean(value: unknown): boolean | null {
	return typeof value === "boolean" ? value : null;
}

function readDestinationProvider(value: unknown): LiveStreamDestinationProvider | null {
	return value === "rtmp" || value === "youtube" ? value : null;
}

function readLiveStreamLayout(value: unknown): LiveStreamLayout | null {
	if (!isObject(value)) return null;
	const webcamMaskShape = value.webcamMaskShape;
	if (
		webcamMaskShape !== "rectangle" &&
		webcamMaskShape !== "rounded" &&
		webcamMaskShape !== "circle" &&
		webcamMaskShape !== "square"
	) {
		return null;
	}
	const webcamSizePreset = value.webcamSizePreset;
	if (typeof webcamSizePreset !== "number" || !Number.isFinite(webcamSizePreset)) {
		return null;
	}
	const rawPosition = value.webcamPosition;
	let webcamPosition: LiveStreamLayout["webcamPosition"] = null;
	if (rawPosition !== null && rawPosition !== undefined) {
		if (!isObject(rawPosition)) return null;
		const { cx, cy } = rawPosition;
		if (
			typeof cx !== "number" ||
			typeof cy !== "number" ||
			!Number.isFinite(cx) ||
			!Number.isFinite(cy)
		) {
			return null;
		}
		webcamPosition = { cx, cy };
	}
	return {
		webcamMaskShape,
		webcamSizePreset,
		webcamPosition,
	};
}

function readSelectedSource(value: unknown): LaunchPreferences["selectedSource"] {
	if (!isObject(value)) return null;
	const id = readString(value.id);
	const displayId = readString(value.displayId);
	return id && displayId ? { id, displayId } : null;
}

function toStoredPreferences(preferences: LaunchPreferences): StoredLaunchPreferences {
	return {
		version: 1,
		...(preferences.destinationProvider
			? { destinationProvider: preferences.destinationProvider }
			: {}),
		...(preferences.rtmpServerUrl ? { rtmpServerUrl: preferences.rtmpServerUrl } : {}),
		...(preferences.selectedSource ? { selectedSource: preferences.selectedSource } : {}),
		...(preferences.systemAudioEnabled !== null
			? { systemAudioEnabled: preferences.systemAudioEnabled }
			: {}),
		...(preferences.microphoneEnabled !== null
			? { microphoneEnabled: preferences.microphoneEnabled }
			: {}),
		...(preferences.microphoneDeviceId
			? { microphoneDeviceId: preferences.microphoneDeviceId }
			: {}),
		...(preferences.webcamEnabled !== null ? { webcamEnabled: preferences.webcamEnabled } : {}),
		...(preferences.webcamDeviceId ? { webcamDeviceId: preferences.webcamDeviceId } : {}),
		...(preferences.liveStreamLayout ? { liveStreamLayout: preferences.liveStreamLayout } : {}),
	};
}

function parseLaunchPreferences(raw: string | null): LaunchPreferences {
	if (!raw) return { ...EMPTY_LAUNCH_PREFERENCES };
	try {
		const parsed = JSON.parse(raw);
		if (!isObject(parsed) || parsed.version !== 1) {
			return { ...EMPTY_LAUNCH_PREFERENCES };
		}
		return {
			destinationProvider: readDestinationProvider(parsed.destinationProvider),
			rtmpServerUrl: readString(parsed.rtmpServerUrl),
			selectedSource: readSelectedSource(parsed.selectedSource),
			systemAudioEnabled: readBoolean(parsed.systemAudioEnabled),
			microphoneEnabled: readBoolean(parsed.microphoneEnabled),
			microphoneDeviceId: readString(parsed.microphoneDeviceId),
			webcamEnabled: readBoolean(parsed.webcamEnabled),
			webcamDeviceId: readString(parsed.webcamDeviceId),
			liveStreamLayout: readLiveStreamLayout(parsed.liveStreamLayout),
		};
	} catch {
		return { ...EMPTY_LAUNCH_PREFERENCES };
	}
}

export function loadLaunchPreferences(): LaunchPreferences {
	try {
		return parseLaunchPreferences(localStorage.getItem(LAUNCH_PREFERENCES_STORAGE_KEY));
	} catch {
		return { ...EMPTY_LAUNCH_PREFERENCES };
	}
}

export function saveLaunchPreferencesPatch(patch: LaunchPreferencesPatch): void {
	try {
		const current = loadLaunchPreferences();
		const next: LaunchPreferences = {
			...current,
			...patch,
			liveStreamLayout: patch.liveStreamLayout
				? { ...DEFAULT_LIVE_STREAM_LAYOUT, ...patch.liveStreamLayout }
				: (patch.liveStreamLayout ?? current.liveStreamLayout),
		};
		localStorage.setItem(LAUNCH_PREFERENCES_STORAGE_KEY, JSON.stringify(toStoredPreferences(next)));
	} catch {
		// Preferences are best-effort; streaming must keep working without localStorage.
	}
}

export function clearLaunchPreferencesForTest(): void {
	localStorage.removeItem(LAUNCH_PREFERENCES_STORAGE_KEY);
}
