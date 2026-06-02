import { describe, expect, it } from "vitest";
import { computeCompositeLayout } from "./compositeLayout";
import {
	DEFAULT_LIVE_OUTPUT_PRESET,
	getLiveOutputPreset,
	joinRtmpsUrl,
	LIVE_OUTPUT_PRESETS,
	validateLiveStreamDestination,
} from "./liveStream";

describe("live stream helpers", () => {
	it("defines the supported output presets", () => {
		expect(LIVE_OUTPUT_PRESETS).toEqual([
			expect.objectContaining({ id: "16:9-1080p", width: 1920, height: 1080 }),
			expect.objectContaining({ id: "9:16-1080p", width: 1080, height: 1920 }),
			expect.objectContaining({ id: "1:1-1080p", width: 1080, height: 1080 }),
		]);
	});

	it("falls back to the default output preset for unknown ids", () => {
		expect(getLiveOutputPreset("missing" as never)).toBe(DEFAULT_LIVE_OUTPUT_PRESET);
	});

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
				serverUrl: "rtmps://example.com/live",
				streamKey: "abc123",
			}),
		).toBeNull();
		expect(
			validateLiveStreamDestination({
				serverUrl: "rtmp://a.rtmp.youtube.com/live2",
				streamKey: "abc123",
			}),
		).toBeNull();
		expect(
			validateLiveStreamDestination({ serverUrl: "https://example.com/live", streamKey: "x" }),
		).toMatchInlineSnapshot(`"Server URL must start with rtmp:// or rtmps://."`);
		expect(
			validateLiveStreamDestination({ serverUrl: "rtmps://example.com/live", streamKey: "" }),
		).toMatchInlineSnapshot(`"Enter a stream key."`);
	});

	it("keeps picture-in-picture webcam inside every live output preset", () => {
		for (const preset of LIVE_OUTPUT_PRESETS) {
			const layout = computeCompositeLayout({
				canvasSize: { width: preset.width, height: preset.height },
				screenSize: { width: 1920, height: 1080 },
				webcamSize: { width: 1280, height: 720 },
				layoutPreset: "picture-in-picture",
				webcamSizePreset: 25,
				webcamPosition: { cx: 1, cy: 1 },
				webcamMaskShape: "rectangle",
			});

			expect(layout?.webcamRect).not.toBeNull();
			expect(layout!.webcamRect!.x).toBeGreaterThanOrEqual(0);
			expect(layout!.webcamRect!.y).toBeGreaterThanOrEqual(0);
			expect(layout!.webcamRect!.x + layout!.webcamRect!.width).toBeLessThanOrEqual(preset.width);
			expect(layout!.webcamRect!.y + layout!.webcamRect!.height).toBeLessThanOrEqual(preset.height);
		}
	});
});
