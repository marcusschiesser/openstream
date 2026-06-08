import { describe, expect, it } from "vitest";
import { computeCompositeLayout } from "./compositeLayout";
import {
	getLiveStreamVideoBitrateKbps,
	joinRtmpsUrl,
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
