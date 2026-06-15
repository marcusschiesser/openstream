import { beforeEach, describe, expect, it } from "vitest";
import {
	clearLaunchPreferencesForTest,
	LAUNCH_PREFERENCES_STORAGE_KEY,
	loadLaunchPreferences,
	saveLaunchPreferencesPatch,
} from "./launchPreferences";

describe("launchPreferences", () => {
	beforeEach(() => {
		clearLaunchPreferencesForTest();
	});

	it("restores valid stored preferences", () => {
		localStorage.setItem(
			LAUNCH_PREFERENCES_STORAGE_KEY,
			JSON.stringify({
				version: 1,
				destinationProvider: "youtube",
				rtmpServerUrl: "rtmps://example.test/live",
				selectedSource: { id: "screen:2:0", displayId: "2" },
				systemAudioEnabled: true,
				microphoneEnabled: true,
				microphoneDeviceId: "mic-1",
				webcamEnabled: true,
				webcamDeviceId: "cam-1",
				liveStreamLayout: {
					webcamMaskShape: "circle",
					webcamSizePreset: 35,
					webcamPosition: { cx: 0.75, cy: 0.25 },
				},
			}),
		);

		expect(loadLaunchPreferences()).toEqual({
			destinationProvider: "youtube",
			rtmpServerUrl: "rtmps://example.test/live",
			selectedSource: { id: "screen:2:0", displayId: "2" },
			systemAudioEnabled: true,
			microphoneEnabled: true,
			microphoneDeviceId: "mic-1",
			webcamEnabled: true,
			webcamDeviceId: "cam-1",
			liveStreamLayout: {
				webcamMaskShape: "circle",
				webcamSizePreset: 35,
				webcamPosition: { cx: 0.75, cy: 0.25 },
			},
		});
	});

	it("falls back for invalid stored preferences", () => {
		localStorage.setItem(
			LAUNCH_PREFERENCES_STORAGE_KEY,
			JSON.stringify({
				version: 1,
				destinationProvider: "invalid",
				rtmpServerUrl: "",
				selectedSource: { id: "screen:2:0" },
				systemAudioEnabled: "yes",
				liveStreamLayout: {
					webcamMaskShape: "triangle",
					webcamSizePreset: 35,
					webcamPosition: null,
				},
			}),
		);

		expect(loadLaunchPreferences()).toEqual({
			destinationProvider: null,
			rtmpServerUrl: null,
			selectedSource: null,
			systemAudioEnabled: null,
			microphoneEnabled: null,
			microphoneDeviceId: null,
			webcamEnabled: null,
			webcamDeviceId: null,
			liveStreamLayout: null,
		});
	});

	it("does not store stream keys", () => {
		saveLaunchPreferencesPatch({
			destinationProvider: "rtmp",
			rtmpServerUrl: "rtmps://example.test/live",
		});

		const stored = localStorage.getItem(LAUNCH_PREFERENCES_STORAGE_KEY) ?? "";
		expect(stored).toContain("rtmpServerUrl");
		expect(stored).not.toContain("streamKey");
	});
});
