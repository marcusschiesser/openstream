import "@testing-library/jest-dom";
import { fireEvent, render, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { WebcamPreviewWindow } from "./WebcamPreviewWindow";

const enabledState: WebcamPreviewState = {
	enabled: true,
	source: { id: "screen:1:0", display_id: "1" },
	webcamDeviceId: "camera-1",
	layout: {
		webcamMaskShape: "rectangle",
		webcamSizePreset: 25,
		webcamPosition: null,
	},
};

describe("WebcamPreviewWindow", () => {
	let previewStateCallback: (state: WebcamPreviewState | null) => void;

	beforeEach(() => {
		Object.defineProperty(window, "innerWidth", { configurable: true, value: 1280 });
		Object.defineProperty(window, "innerHeight", { configurable: true, value: 720 });

		window.electronAPI = {
			...window.electronAPI,
			onWebcamPreviewStateChanged: vi.fn((callback) => {
				previewStateCallback = callback;
				return vi.fn();
			}),
			sendWebcamPreviewPosition: vi.fn(),
			setWebcamPreviewPointerMode: vi.fn(),
		} as typeof window.electronAPI;

		Object.defineProperty(navigator, "mediaDevices", {
			configurable: true,
			value: {
				getUserMedia: vi.fn().mockResolvedValue({
					getTracks: () => [{ stop: vi.fn() }],
				}),
			},
		});

		HTMLMediaElement.prototype.play = vi.fn().mockResolvedValue(undefined);
		HTMLMediaElement.prototype.setPointerCapture = vi.fn();
		HTMLMediaElement.prototype.releasePointerCapture = vi.fn();
		HTMLMediaElement.prototype.hasPointerCapture = vi.fn().mockReturnValue(true);
	});

	it("does not render video when preview is disabled", async () => {
		const { container } = render(<WebcamPreviewWindow />);

		await waitFor(() => {
			expect(window.electronAPI.onWebcamPreviewStateChanged).toHaveBeenCalled();
		});
		expect(container.querySelector("video")).not.toBeInTheDocument();
	});

	it("renders video when preview is enabled and a layout rect exists", async () => {
		const { container } = render(<WebcamPreviewWindow />);
		previewStateCallback(enabledState);

		await waitFor(() => {
			expect(container.querySelector("video")).toBeInTheDocument();
		});
	});

	it("emits normalized position updates when the PiP is dragged", async () => {
		const { container } = render(<WebcamPreviewWindow />);
		previewStateCallback(enabledState);
		const video = await waitFor(() => {
			const element = container.querySelector("video");
			expect(element).toBeInTheDocument();
			return element as HTMLVideoElement;
		});

		Object.defineProperty(video, "getBoundingClientRect", {
			configurable: true,
			value: () => ({ left: 960, top: 520, width: 240, height: 135, right: 1200, bottom: 655 }),
		});

		fireEvent.pointerDown(video, { clientX: 1080, clientY: 587, pointerId: 1 });
		fireEvent.pointerMove(video, { clientX: 1000, clientY: 500, pointerId: 1 });

		expect(window.electronAPI.sendWebcamPreviewPosition).toHaveBeenCalledWith({
			cx: expect.any(Number),
			cy: expect.any(Number),
		});
	});
});
