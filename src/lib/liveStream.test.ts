import { describe, expect, it } from "vitest";
import { computeCompositeLayout } from "./compositeLayout";
import {
	getLiveStreamVideoBitrateKbps,
	getYouTubeWatchUrl,
	joinRtmpsUrl,
	joinYouTubeIngestionUrl,
	validateLiveStreamDestination,
} from "./liveStream";

describe("live stream helpers", () => {
	it("joins the RTMP server URL and stream key", () => {
		expect(joinRtmpsUrl("rtmps://example.com/live/", "abc123")).toBe(
			"rtmps://example.com/live/abc123",
		);
		expect(joinRtmpsUrl("rtmp://a.rtmp.youtube.com/live2/", "abc123")).toBe(
			"rtmp://a.rtmp.youtube.com/live2/abc123",
		);
	});

	it("validates RTMP destination input", () => {
		expect(
			validateLiveStreamDestination({
				provider: "rtmp",
				serverUrl: "rtmps://example.com/live",
				streamKey: "abc123",
			}),
		).toBeNull();
		expect(
			validateLiveStreamDestination({
				provider: "rtmp",
				serverUrl: "rtmp://a.rtmp.youtube.com/live2",
				streamKey: "abc123",
			}),
		).toBeNull();
		expect(
			validateLiveStreamDestination({
				provider: "rtmp",
				serverUrl: "https://example.com/live",
				streamKey: "x",
			}),
		).toMatchInlineSnapshot(`"Server URL must start with rtmp:// or rtmps://."`);
		expect(
			validateLiveStreamDestination({
				provider: "rtmp",
				serverUrl: "rtmps://example.com/live",
				streamKey: "",
			}),
		).toMatchInlineSnapshot(`"Enter a stream key."`);
	});

	it("validates YouTube destination input", () => {
		expect(
			validateLiveStreamDestination({
				provider: "youtube",
				isConfigured: true,
				isAuthenticated: true,
			}),
		).toBeNull();
		expect(
			validateLiveStreamDestination({
				provider: "youtube",
				isConfigured: true,
				isAuthenticated: false,
			}),
		).toMatchInlineSnapshot(`"Sign in with Google to stream to YouTube Live."`);
		expect(
			validateLiveStreamDestination({
				provider: "youtube",
				isConfigured: false,
				isAuthenticated: true,
			}),
		).toMatchInlineSnapshot(`"YouTube Live sign-in is not configured."`);
	});

	it("builds YouTube ingestion and watch URLs", () => {
		expect(joinYouTubeIngestionUrl("rtmps://a.rtmps.youtube.com/live2/", "stream-name")).toBe(
			"rtmps://a.rtmps.youtube.com/live2/stream-name",
		);
		expect(joinYouTubeIngestionUrl("rtmp://a.rtmp.youtube.com/live2/", "stream-name")).toBe(
			"rtmp://a.rtmp.youtube.com/live2/stream-name",
		);
		expect(getYouTubeWatchUrl("abc123")).toBe("https://www.youtube.com/watch?v=abc123");
	});

	it("selects live bitrate from native source dimensions", () => {
		expect(getLiveStreamVideoBitrateKbps({ width: 1920, height: 1080 })).toBe(6000);
		expect(getLiveStreamVideoBitrateKbps({ width: 3840, height: 2160 })).toBe(6000);
		expect(getLiveStreamVideoBitrateKbps({ width: 1280, height: 720 })).toBe(4500);
		expect(getLiveStreamVideoBitrateKbps({ width: 1080, height: 1920 })).toBe(4500);
	});

	it("keeps picture-in-picture webcam inside native source canvases", () => {
		for (const sourceSize of [
			{ width: 1920, height: 1080 },
			{ width: 1080, height: 1920 },
			{ width: 1680, height: 1050 },
		]) {
			const layout = computeCompositeLayout({
				canvasSize: sourceSize,
				screenSize: sourceSize,
				webcamSize: { width: 1280, height: 720 },
				layoutPreset: "picture-in-picture",
				webcamSizePreset: 25,
				webcamPosition: { cx: 1, cy: 1 },
				webcamMaskShape: "rectangle",
			});

			expect(layout?.webcamRect).not.toBeNull();
			expect(layout!.webcamRect!.x).toBeGreaterThanOrEqual(0);
			expect(layout!.webcamRect!.y).toBeGreaterThanOrEqual(0);
			expect(layout!.webcamRect!.x + layout!.webcamRect!.width).toBeLessThanOrEqual(
				sourceSize.width,
			);
			expect(layout!.webcamRect!.y + layout!.webcamRect!.height).toBeLessThanOrEqual(
				sourceSize.height,
			);
		}
	});
});
