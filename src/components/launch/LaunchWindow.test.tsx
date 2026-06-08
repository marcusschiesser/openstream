import "@testing-library/jest-dom";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TooltipProvider } from "../ui/tooltip";
import { LaunchWindow } from "./LaunchWindow";

vi.mock("@/contexts/I18nContext", () => ({
	useI18n: () => ({
		locale: "en",
		setLocale: vi.fn(),
		systemLocaleSuggestion: null,
		acceptSystemLocaleSuggestion: vi.fn(),
		dismissSystemLocaleSuggestion: vi.fn(),
		resolveSystemLocaleSuggestion: vi.fn(),
	}),
	useScopedT: () => (key: string) => {
		const labels: Record<string, string> = {
			"audio.defaultMicrophone": "Default microphone",
			"webcam.defaultCamera": "Default camera",
			"webcam.searching": "Searching",
			"webcam.unavailable": "Unavailable",
			"webcam.noneFound": "No cameras",
			"tooltips.useVerticalTray": "Use vertical tray",
			"tooltips.useHorizontalTray": "Use horizontal tray",
			"tooltips.hideHUD": "Hide HUD",
			"tooltips.closeApp": "Close app",
			language: "Language",
		};
		return labels[key] ?? key;
	},
}));

vi.mock("@/i18n/loader", () => ({
	getAvailableLocales: () => ["en"],
	getLocaleName: () => "English",
}));

vi.mock("../../hooks/useAudioLevelMeter", () => ({
	useAudioLevelMeter: () => ({ level: 0 }),
}));

vi.mock("../../hooks/useCameraDevices", () => ({
	useCameraDevices: () => ({
		devices: [],
		selectedDeviceId: "",
		setSelectedDeviceId: vi.fn(),
		isLoading: false,
		error: null,
	}),
}));

vi.mock("../../hooks/useLiveStreamer", () => ({
	useLiveStreamer: () => ({
		streaming: false,
		streamElapsedSeconds: 0,
		startLiveStream: vi.fn(),
		stopLiveStream: vi.fn(),
	}),
}));

vi.mock("../../hooks/useMicrophoneDevices", () => ({
	useMicrophoneDevices: () => ({
		devices: [],
		selectedDeviceId: "",
		setSelectedDeviceId: vi.fn(),
	}),
}));

function makeScreen(index: number): ProcessedDesktopSource {
	return {
		id: `screen:${index}:0`,
		name: `Screen ${index}`,
		display_id: String(index),
		thumbnail: null,
	};
}

async function flushPromises(times = 3) {
	for (let index = 0; index < times; index += 1) {
		await Promise.resolve();
	}
}

describe("LaunchWindow screen selection", () => {
	beforeEach(() => {
		window.electronAPI = {
			...window.electronAPI,
			getScreenSources: vi.fn(),
			getSelectedSource: vi.fn(),
			selectSource: vi.fn(),
			requestScreenAccess: vi.fn().mockResolvedValue({
				success: true,
				granted: true,
				status: "granted",
			}),
			requestCameraAccess: vi.fn().mockResolvedValue({
				success: true,
				granted: true,
				status: "granted",
			}),
			setHudOverlayIgnoreMouseEvents: vi.fn(),
			setHudOverlayExpanded: vi.fn(),
			moveHudOverlayBy: vi.fn(),
			setWebcamPreviewState: vi.fn(),
			onWebcamPreviewStateChanged: vi.fn(() => vi.fn()),
			sendWebcamPreviewPosition: vi.fn(),
			setWebcamPreviewPointerMode: vi.fn(),
		} as typeof window.electronAPI;
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it("auto-selects the first screen without showing a dropdown when only one screen exists", async () => {
		const screenOne = makeScreen(1);
		vi.mocked(window.electronAPI.getScreenSources).mockResolvedValue([screenOne]);
		vi.mocked(window.electronAPI.getSelectedSource).mockResolvedValue(screenOne);

		render(
			<TooltipProvider>
				<LaunchWindow />
			</TooltipProvider>,
		);

		await waitFor(() => {
			expect(screen.getByText("Screen 1")).toBeInTheDocument();
		});
		expect(screen.queryByTestId("launch-screen-select")).not.toBeInTheDocument();
	});

	it("requests camera access on launch to activate the webcam by default", async () => {
		const screenOne = makeScreen(1);
		vi.mocked(window.electronAPI.getScreenSources).mockResolvedValue([screenOne]);
		vi.mocked(window.electronAPI.getSelectedSource).mockResolvedValue(screenOne);

		render(
			<TooltipProvider>
				<LaunchWindow />
			</TooltipProvider>,
		);

		await waitFor(() => {
			expect(window.electronAPI.requestCameraAccess).toHaveBeenCalled();
		});
		await waitFor(() => {
			expect(window.electronAPI.setWebcamPreviewState).toHaveBeenCalledWith(
				expect.objectContaining({ enabled: true }),
			);
		});
	});

	it("keeps the selected screen label visible during background refreshes", async () => {
		vi.useFakeTimers();
		const screenOne = makeScreen(1);
		vi.mocked(window.electronAPI.getScreenSources).mockResolvedValue([screenOne]);
		vi.mocked(window.electronAPI.getSelectedSource).mockResolvedValue(screenOne);

		render(
			<TooltipProvider>
				<LaunchWindow />
			</TooltipProvider>,
		);

		await act(async () => {
			await flushPromises();
		});
		expect(screen.getByText("Screen 1")).toBeInTheDocument();

		vi.mocked(window.electronAPI.getScreenSources).mockImplementation(
			() => new Promise(() => undefined),
		);
		await act(async () => {
			vi.advanceTimersByTime(2500);
			await flushPromises();
		});

		expect(screen.getByText("Screen 1")).toBeInTheDocument();
		expect(screen.queryByText("Loading...")).not.toBeInTheDocument();
	});

	it("shows a screen dropdown when multiple screens exist and persists changes", async () => {
		const screenOne = makeScreen(1);
		const screenTwo = makeScreen(2);
		vi.mocked(window.electronAPI.getScreenSources).mockResolvedValue([screenOne, screenTwo]);
		vi.mocked(window.electronAPI.getSelectedSource).mockResolvedValue(screenOne);
		vi.mocked(window.electronAPI.selectSource).mockResolvedValue(screenTwo);

		render(
			<TooltipProvider>
				<LaunchWindow />
			</TooltipProvider>,
		);

		const select = await screen.findByTestId("launch-screen-select");
		expect(select).toHaveValue(screenOne.id);

		fireEvent.change(select, { target: { value: screenTwo.id } });

		await waitFor(() => {
			expect(window.electronAPI.selectSource).toHaveBeenCalledWith(screenTwo);
		});
	});

	it("sends webcam preview state to the preview window instead of rendering a HUD video", async () => {
		const screenOne = makeScreen(1);
		vi.mocked(window.electronAPI.getScreenSources).mockResolvedValue([screenOne]);
		vi.mocked(window.electronAPI.getSelectedSource).mockResolvedValue(screenOne);

		const { container } = render(
			<TooltipProvider>
				<LaunchWindow />
			</TooltipProvider>,
		);

		await screen.findByText("Screen 1");
		fireEvent.click(screen.getByTestId("launch-webcam-button"));

		await waitFor(() => {
			expect(window.electronAPI.setWebcamPreviewState).toHaveBeenCalledWith(
				expect.objectContaining({
					enabled: true,
					source: { id: screenOne.id, display_id: screenOne.display_id },
				}),
			);
		});
		expect(container.querySelector("video")).not.toBeInTheDocument();
	});
});
