import type { WebcamLayoutPreset, WebcamSizePreset } from "@/lib/compositeLayout";
import type { WebcamMaskShape, WebcamPosition } from "@/lib/liveLayoutTypes";

export type LiveOutputPresetId = "16:9-1080p" | "9:16-1080p" | "1:1-1080p";

export interface LiveOutputPreset {
	id: LiveOutputPresetId;
	label: string;
	width: number;
	height: number;
	aspectRatio: string;
	videoBitrateKbps: number;
}

export interface LiveStreamLayout {
	outputPreset: LiveOutputPreset;
	webcamLayoutPreset: WebcamLayoutPreset;
	webcamMaskShape: WebcamMaskShape;
	webcamSizePreset: WebcamSizePreset;
	webcamPosition: WebcamPosition | null;
}

export interface LiveStreamDestinationInput {
	serverUrl: string;
	streamKey: string;
}

export interface LiveStreamStartConfig extends LiveStreamDestinationInput {
	layout: LiveStreamLayout;
}

export const LIVE_OUTPUT_PRESETS: LiveOutputPreset[] = [
	{
		id: "16:9-1080p",
		label: "16:9 1080p",
		width: 1920,
		height: 1080,
		aspectRatio: "16:9",
		videoBitrateKbps: 6000,
	},
	{
		id: "9:16-1080p",
		label: "9:16 1080x1920",
		width: 1080,
		height: 1920,
		aspectRatio: "9:16",
		videoBitrateKbps: 4500,
	},
	{
		id: "1:1-1080p",
		label: "1:1 1080x1080",
		width: 1080,
		height: 1080,
		aspectRatio: "1:1",
		videoBitrateKbps: 4500,
	},
];

export const DEFAULT_LIVE_OUTPUT_PRESET = LIVE_OUTPUT_PRESETS[0];

export const DEFAULT_LIVE_STREAM_LAYOUT: LiveStreamLayout = {
	outputPreset: DEFAULT_LIVE_OUTPUT_PRESET,
	webcamLayoutPreset: "picture-in-picture",
	webcamMaskShape: "rectangle",
	webcamSizePreset: 25,
	webcamPosition: null,
};

export function getLiveOutputPreset(id: LiveOutputPresetId): LiveOutputPreset {
	return LIVE_OUTPUT_PRESETS.find((preset) => preset.id === id) ?? DEFAULT_LIVE_OUTPUT_PRESET;
}

export function normalizeRtmpsServerUrl(serverUrl: string): string {
	return serverUrl.trim().replace(/\/+$/, "");
}

export function joinRtmpsUrl(serverUrl: string, streamKey: string): string {
	return `${normalizeRtmpsServerUrl(serverUrl)}/${streamKey.trim()}`;
}

export function validateLiveStreamDestination(input: LiveStreamDestinationInput): string | null {
	const serverUrl = normalizeRtmpsServerUrl(input.serverUrl);
	const streamKey = input.streamKey.trim();

	if (!serverUrl) {
		return "Enter an RTMP or RTMPS server URL.";
	}

	const lowerServerUrl = serverUrl.toLowerCase();
	if (!lowerServerUrl.startsWith("rtmp://") && !lowerServerUrl.startsWith("rtmps://")) {
		return "Server URL must start with rtmp:// or rtmps://.";
	}

	try {
		const parsed = new URL(serverUrl);
		if ((parsed.protocol !== "rtmp:" && parsed.protocol !== "rtmps:") || !parsed.hostname) {
			return "Enter a valid RTMP or RTMPS server URL.";
		}
	} catch {
		return "Enter a valid RTMP or RTMPS server URL.";
	}

	if (!streamKey) {
		return "Enter a stream key.";
	}

	return null;
}
