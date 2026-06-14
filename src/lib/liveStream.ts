import type { WebcamSizePreset } from "@/lib/compositeLayout";
import type { WebcamMaskShape, WebcamPosition } from "@/lib/liveLayoutTypes";

export interface LiveStreamLayout {
	webcamMaskShape: WebcamMaskShape;
	webcamSizePreset: WebcamSizePreset;
	webcamPosition: WebcamPosition | null;
}

export type LiveStreamDestinationProvider = "rtmp" | "youtube";

export interface RtmpLiveStreamDestinationInput {
	provider: "rtmp";
	serverUrl: string;
	streamKey: string;
}

export interface YouTubeLiveStreamDestinationInput {
	provider: "youtube";
	isAuthenticated: boolean;
}

export type LiveStreamDestinationInput =
	| RtmpLiveStreamDestinationInput
	| YouTubeLiveStreamDestinationInput;

export interface LiveStreamStartConfig {
	destination: LiveStreamDestinationInput;
	layout: LiveStreamLayout;
}

export const DEFAULT_LIVE_STREAM_LAYOUT: LiveStreamLayout = {
	webcamMaskShape: "rectangle",
	webcamSizePreset: 25,
	webcamPosition: null,
};

export function getLiveStreamVideoBitrateKbps(size: { width: number; height: number }): number {
	return size.width >= 1920 && size.height >= 1080 ? 6000 : 4500;
}

export function normalizeRtmpsServerUrl(serverUrl: string): string {
	return serverUrl.trim().replace(/\/+$/, "");
}

export function joinRtmpsUrl(serverUrl: string, streamKey: string): string {
	return `${normalizeRtmpsServerUrl(serverUrl)}/${streamKey.trim()}`;
}

export function joinYouTubeIngestionUrl(ingestionAddress: string, streamName: string): string {
	return joinRtmpsUrl(ingestionAddress, streamName);
}

export function getYouTubeWatchUrl(broadcastId: string): string {
	return `https://www.youtube.com/watch?v=${encodeURIComponent(broadcastId)}`;
}

export function validateLiveStreamDestination(input: LiveStreamDestinationInput): string | null {
	if (input.provider === "youtube") {
		return input.isAuthenticated ? null : "Sign in with Google to stream to YouTube Live.";
	}

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
