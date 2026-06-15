import "@testing-library/jest-dom";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TooltipProvider } from "../ui/tooltip";
import { LaunchWindow } from "./LaunchWindow";

const deviceHookMocks = vi.hoisted(() => ({
	cameraDevices: [] as Array<{ deviceId: string; label: string }>,
	selectedCameraId: "",
	setSelectedCameraId: vi.fn(),
	cameraLoading: false,
	cameraError: null as string | null,
	micDevices: [] as Array<{ deviceId: string; label: string }>,
	selectedMicId: "",
	setSelectedMicId: vi.fn(),
	streaming: false,
	streamElapsedSeconds: 0,
	startLiveStream: vi.fn(),
	stopLiveStream: vi.fn(),
	liveStreamerConfig: null as {
		onProviderWatchUrl?: (watchUrl: string) => void;
		onProviderStatus?: (status: {
			status: string | null;
			timerStarted: boolean;
			stopAllowed: boolean;
			startedAt: number | null;
		}) => void;
	} | null,
	providerTimerStarted: false,
	providerStopAllowed: false,
	providerStatus: null as string | null,
}));

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
		devices: deviceHookMocks.cameraDevices,
		selectedDeviceId: deviceHookMocks.selectedCameraId,
		setSelectedDeviceId: deviceHookMocks.setSelectedCameraId,
		isLoading: deviceHookMocks.cameraLoading,
		error: deviceHookMocks.cameraError,
	}),
}));

vi.mock("../../hooks/useLiveStreamer", () => ({
	useLiveStreamer: (config: typeof deviceHookMocks.liveStreamerConfig) => {
		deviceHookMocks.liveStreamerConfig = config;
		return {
			streaming: deviceHookMocks.streaming,
			providerTimerStarted: deviceHookMocks.providerTimerStarted,
			providerStopAllowed: deviceHookMocks.providerStopAllowed,
			providerStatus: deviceHookMocks.providerStatus,
			streamElapsedSeconds: deviceHookMocks.streamElapsedSeconds,
			startLiveStream: deviceHookMocks.startLiveStream,
			stopLiveStream: deviceHookMocks.stopLiveStream,
		};
	},
}));

vi.mock("../../hooks/useMicrophoneDevices", () => ({
	useMicrophoneDevices: () => ({
		devices: deviceHookMocks.micDevices,
		selectedDeviceId: deviceHookMocks.selectedMicId,
		setSelectedDeviceId: deviceHookMocks.setSelectedMicId,
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
		deviceHookMocks.cameraDevices = [];
		deviceHookMocks.selectedCameraId = "";
		deviceHookMocks.setSelectedCameraId.mockClear();
		deviceHookMocks.cameraLoading = false;
		deviceHookMocks.cameraError = null;
		deviceHookMocks.micDevices = [];
		deviceHookMocks.selectedMicId = "";
		deviceHookMocks.setSelectedMicId.mockClear();
		deviceHookMocks.streaming = false;
		deviceHookMocks.providerTimerStarted = false;
		deviceHookMocks.providerStopAllowed = false;
		deviceHookMocks.providerStatus = null;
		deviceHookMocks.streamElapsedSeconds = 0;
		deviceHookMocks.startLiveStream.mockReset();
		deviceHookMocks.stopLiveStream.mockReset();
		deviceHookMocks.liveStreamerConfig = null;
		window.electronAPI = {
			...window.electronAPI,
			getScreenSources: vi.fn(),
			getSelectedSource: vi.fn(),
			selectSource: vi.fn(),
			captureSelectedSourcePreview: vi.fn(),
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
			copyToClipboard: vi.fn().mockResolvedValue({ success: true }),
			setHudOverlayIgnoreMouseEvents: vi.fn(),
			moveHudOverlayBy: vi.fn(),
			setWebcamPreviewState: vi.fn(),
			onWebcamPreviewStateChanged: vi.fn(() => vi.fn()),
			sendWebcamPreviewPosition: vi.fn(),
			setWebcamPreviewPointerMode: vi.fn(),
			youtubeAuthStatus: vi.fn().mockResolvedValue({ configured: true, authenticated: false }),
			youtubeAuthStart: vi.fn().mockResolvedValue({ success: true }),
			youtubeCreateLiveStream: vi.fn().mockResolvedValue({
				success: true,
				liveStream: {
					broadcastId: "broadcast-1",
					streamId: "stream-1",
					watchUrl: "https://www.youtube.com/watch?v=broadcast-1",
					ingestionUrl: "rtmps://a.rtmps.youtube.com/live2/stream-key",
				},
			}),
			youtubeGetBroadcastStatus: vi.fn().mockResolvedValue({
				success: true,
				lifeCycleStatus: "live",
			}),
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

	it("opens destination controls when starting with missing destination information", async () => {
		const screenOne = makeScreen(1);
		vi.mocked(window.electronAPI.getScreenSources).mockResolvedValue([screenOne]);
		vi.mocked(window.electronAPI.getSelectedSource).mockResolvedValue(screenOne);

		render(
			<TooltipProvider>
				<LaunchWindow />
			</TooltipProvider>,
		);

		await screen.findByText("Screen 1");
		fireEvent.click(screen.getByTestId("launch-live-stream-button"));

		expect(await screen.findByLabelText("Stream key")).toBeInTheDocument();
		expect(screen.getByText("Enter a stream key.")).toBeInTheDocument();
		expect(window.electronAPI.captureSelectedSourcePreview).not.toHaveBeenCalled();
	});

	it("pulses the live stream icon while the stream is starting", async () => {
		const screenOne = makeScreen(1);
		let resolveStart: ((started: boolean) => void) | null = null;
		vi.mocked(window.electronAPI.getScreenSources).mockResolvedValue([screenOne]);
		vi.mocked(window.electronAPI.getSelectedSource).mockResolvedValue(screenOne);
		deviceHookMocks.startLiveStream.mockImplementation(
			() =>
				new Promise<boolean>((resolve) => {
					resolveStart = resolve;
				}),
		);

		render(
			<TooltipProvider>
				<LaunchWindow />
			</TooltipProvider>,
		);

		await screen.findByText("Screen 1");
		fireEvent.pointerMove(screen.getByText("rtmp://a.rtmp.youtube.com/live2"));
		fireEvent.change(screen.getByLabelText("Stream key"), { target: { value: "abc123" } });
		fireEvent.click(screen.getByTestId("launch-live-stream-button"));

		await waitFor(() => {
			const icon = screen.getByTestId("launch-live-stream-button").querySelector("svg");
			expect(icon).toHaveClass("animate-pulse");
		});

		await act(async () => {
			resolveStart?.(false);
			await flushPromises();
		});
	});

	it("shows the destination pill by default and expands it on hover", async () => {
		const screenOne = makeScreen(1);
		vi.mocked(window.electronAPI.getScreenSources).mockResolvedValue([screenOne]);
		vi.mocked(window.electronAPI.getSelectedSource).mockResolvedValue(screenOne);

		render(
			<TooltipProvider>
				<LaunchWindow />
			</TooltipProvider>,
		);

		await screen.findByText("Screen 1");
		expect(screen.queryByTestId("launch-destination-button")).not.toBeInTheDocument();

		const readOnlyDestination = screen.getByText("rtmp://a.rtmp.youtube.com/live2");
		expect(readOnlyDestination).toBeInTheDocument();
		expect(screen.queryByLabelText("Server URL")).not.toBeInTheDocument();

		fireEvent.pointerMove(readOnlyDestination);
		expect(screen.getByLabelText("Server URL")).toBeInTheDocument();
		expect(screen.getByLabelText("Stream key")).toBeInTheDocument();
	});

	it("switches the destination pill to YouTube and signs in", async () => {
		const screenOne = makeScreen(1);
		vi.mocked(window.electronAPI.getScreenSources).mockResolvedValue([screenOne]);
		vi.mocked(window.electronAPI.getSelectedSource).mockResolvedValue(screenOne);

		render(
			<TooltipProvider>
				<LaunchWindow />
			</TooltipProvider>,
		);

		await screen.findByText("Screen 1");
		const readOnlyDestination = screen.getByText("rtmp://a.rtmp.youtube.com/live2");
		fireEvent.pointerMove(readOnlyDestination);
		fireEvent.click(screen.getByText("YouTube Live"));
		expect(await screen.findByText("Sign in with Google")).toBeInTheDocument();

		fireEvent.click(screen.getByText("Sign in with Google"));

		await waitFor(() => {
			expect(window.electronAPI.youtubeAuthStart).toHaveBeenCalled();
		});
		expect(await screen.findByText("Signed in with Google")).toBeInTheDocument();
	});

	it("keeps the YouTube live URL visible while streaming", async () => {
		const screenOne = makeScreen(1);
		vi.mocked(window.electronAPI.getScreenSources).mockResolvedValue([screenOne]);
		vi.mocked(window.electronAPI.getSelectedSource).mockResolvedValue(screenOne);

		const { rerender } = render(
			<TooltipProvider>
				<LaunchWindow />
			</TooltipProvider>,
		);

		await screen.findByText("Screen 1");
		fireEvent.pointerMove(screen.getByText("rtmp://a.rtmp.youtube.com/live2"));
		fireEvent.click(screen.getByText("YouTube Live"));
		fireEvent.click(await screen.findByText("Sign in with Google"));
		await screen.findByText("Signed in with Google");

		act(() => {
			deviceHookMocks.streaming = true;
			deviceHookMocks.streamElapsedSeconds = 9;
			rerender(
				<TooltipProvider>
					<LaunchWindow />
				</TooltipProvider>,
			);
		});

		expect(screen.getByText("YouTube Live")).toBeInTheDocument();
		expect(
			screen.queryByText("https://www.youtube.com/watch?v=broadcast-1"),
		).not.toBeInTheDocument();
		expect(screen.queryByLabelText("Copy YouTube live URL")).not.toBeInTheDocument();
		expect(screen.queryByText("00:09")).not.toBeInTheDocument();

		act(() => {
			deviceHookMocks.liveStreamerConfig?.onProviderWatchUrl?.(
				"https://www.youtube.com/watch?v=broadcast-1",
			);
		});

		expect(screen.getByText("https://www.youtube.com/watch?v=broadcast-1")).toBeInTheDocument();
		expect(
			screen.queryByText("Last stream: https://www.youtube.com/watch?v=broadcast-1"),
		).not.toBeInTheDocument();
		expect(screen.queryByText("00:09")).not.toBeInTheDocument();

		act(() => {
			deviceHookMocks.liveStreamerConfig?.onProviderStatus?.({
				status: "ready",
				timerStarted: true,
				stopAllowed: false,
				startedAt: Date.now() - 9000,
			});
			deviceHookMocks.providerTimerStarted = true;
			rerender(
				<TooltipProvider>
					<LaunchWindow />
				</TooltipProvider>,
			);
		});

		expect(screen.getByText("https://www.youtube.com/watch?v=broadcast-1")).toBeInTheDocument();
		expect(screen.getByText("YouTube: ready")).toBeInTheDocument();
		expect(screen.getByText("00:09")).toBeInTheDocument();
	});

	it("locks YouTube stop until the provider reaches live", async () => {
		const screenOne = makeScreen(1);
		vi.mocked(window.electronAPI.getScreenSources).mockResolvedValue([screenOne]);
		vi.mocked(window.electronAPI.getSelectedSource).mockResolvedValue(screenOne);

		const { rerender } = render(
			<TooltipProvider>
				<LaunchWindow />
			</TooltipProvider>,
		);

		await screen.findByText("Screen 1");
		fireEvent.pointerMove(screen.getByText("rtmp://a.rtmp.youtube.com/live2"));
		fireEvent.click(screen.getByText("YouTube Live"));
		fireEvent.click(await screen.findByText("Sign in with Google"));
		await screen.findByText("Signed in with Google");

		act(() => {
			deviceHookMocks.liveStreamerConfig?.onProviderWatchUrl?.(
				"https://www.youtube.com/watch?v=broadcast-1",
			);
			deviceHookMocks.liveStreamerConfig?.onProviderStatus?.({
				status: "ready",
				timerStarted: true,
				stopAllowed: false,
				startedAt: Date.now() - 9000,
			});
			deviceHookMocks.streaming = true;
			deviceHookMocks.providerTimerStarted = true;
			deviceHookMocks.providerStopAllowed = false;
			deviceHookMocks.streamElapsedSeconds = 9;
			rerender(
				<TooltipProvider>
					<LaunchWindow />
				</TooltipProvider>,
			);
		});

		const stopButton = screen.getByTestId("launch-live-stream-button");
		expect(stopButton).toBeDisabled();
		expect(stopButton).not.toHaveAttribute("title");
		expect(stopButton.closest("[title]")).toHaveAttribute(
			"title",
			"Stop will be available once stream is live.",
		);
		fireEvent.click(stopButton);
		expect(deviceHookMocks.stopLiveStream).not.toHaveBeenCalled();
		expect(screen.getByText("YouTube: ready")).toBeInTheDocument();
		expect(screen.getByText("00:09")).toBeInTheDocument();

		act(() => {
			deviceHookMocks.liveStreamerConfig?.onProviderStatus?.({
				status: "live",
				timerStarted: true,
				stopAllowed: true,
				startedAt: null,
			});
			deviceHookMocks.providerStopAllowed = true;
			deviceHookMocks.streamElapsedSeconds = 9;
			rerender(
				<TooltipProvider>
					<LaunchWindow />
				</TooltipProvider>,
			);
		});

		expect(screen.getByTestId("launch-live-stream-button")).not.toBeDisabled();
		expect(screen.getByTestId("launch-live-stream-button")).toHaveAttribute(
			"title",
			"Stop live stream",
		);
		expect(screen.getByText("YouTube: live")).toBeInTheDocument();
		expect(screen.getByText("00:09")).toBeInTheDocument();
	});

	it("hides readonly control pills while destination controls are expanded", async () => {
		const screenOne = makeScreen(1);
		vi.mocked(window.electronAPI.getScreenSources).mockResolvedValue([screenOne]);
		vi.mocked(window.electronAPI.getSelectedSource).mockResolvedValue(screenOne);

		render(
			<TooltipProvider>
				<LaunchWindow />
			</TooltipProvider>,
		);

		await screen.findByText("Screen 1");
		expect(await screen.findByText("No cameras")).toBeInTheDocument();

		const readOnlyDestination = screen.getByText("rtmp://a.rtmp.youtube.com/live2");
		expect(readOnlyDestination).toBeInTheDocument();

		fireEvent.pointerMove(readOnlyDestination);

		expect(screen.getByLabelText("Server URL")).toBeInTheDocument();
		expect(screen.getByLabelText("Stream key")).toBeInTheDocument();
		expect(screen.queryByText("No cameras")).not.toBeInTheDocument();
	});

	it("returns microphone controls to readonly after changing the selected microphone", async () => {
		deviceHookMocks.micDevices = [
			{ deviceId: "mic-1", label: "Desk Mic" },
			{ deviceId: "mic-2", label: "Studio Mic" },
		];
		deviceHookMocks.selectedMicId = "mic-1";
		const screenOne = makeScreen(1);
		vi.mocked(window.electronAPI.getScreenSources).mockResolvedValue([screenOne]);
		vi.mocked(window.electronAPI.getSelectedSource).mockResolvedValue(screenOne);

		render(
			<TooltipProvider>
				<LaunchWindow />
			</TooltipProvider>,
		);

		await screen.findByText("Screen 1");
		fireEvent.click(screen.getByTestId("launch-microphone-button"));

		await waitFor(() => {
			expect(screen.getAllByText("Desk Mic").length).toBeGreaterThan(0);
		});
		const readOnlyMic = screen.getAllByText("Desk Mic")[0];
		fireEvent.pointerMove(readOnlyMic);

		const micSelect = screen.getByLabelText("Microphone source");
		expect(micSelect).not.toHaveClass("sr-only");
		fireEvent.change(micSelect, { target: { value: "mic-2" } });

		expect(deviceHookMocks.setSelectedMicId).toHaveBeenCalledWith("mic-2");
		expect(screen.getAllByText("Studio Mic")[0]).toBeInTheDocument();
		expect(screen.queryByLabelText("Microphone source")).not.toBeInTheDocument();
	});

	it("returns microphone controls to readonly after leaving an unchanged open selector", async () => {
		deviceHookMocks.micDevices = [
			{ deviceId: "mic-1", label: "Desk Mic" },
			{ deviceId: "mic-2", label: "Studio Mic" },
		];
		deviceHookMocks.selectedMicId = "mic-1";
		const screenOne = makeScreen(1);
		vi.mocked(window.electronAPI.getScreenSources).mockResolvedValue([screenOne]);
		vi.mocked(window.electronAPI.getSelectedSource).mockResolvedValue(screenOne);

		render(
			<TooltipProvider>
				<LaunchWindow />
			</TooltipProvider>,
		);

		await screen.findByText("Screen 1");
		fireEvent.click(screen.getByTestId("launch-microphone-button"));
		await waitFor(() => expect(screen.getAllByText("Desk Mic").length).toBeGreaterThan(0));
		const readOnlyMic = screen.getAllByText("Desk Mic")[0];
		fireEvent.pointerMove(readOnlyMic);

		const micSelect = screen.getByLabelText("Microphone source");
		fireEvent.focus(micSelect);
		const micPanel = micSelect.closest("[style*='width: 240px']");
		expect(micPanel).toBeTruthy();

		vi.useFakeTimers();
		fireEvent.mouseLeave(micPanel as Element);
		act(() => {
			vi.advanceTimersByTime(120);
		});

		expect(screen.queryByLabelText("Microphone source")).not.toBeInTheDocument();
	});

	it("returns webcam controls to readonly after changing the selected webcam", async () => {
		deviceHookMocks.cameraDevices = [
			{ deviceId: "cam-1", label: "Camera One" },
			{ deviceId: "cam-2", label: "Camera Two" },
		];
		deviceHookMocks.selectedCameraId = "cam-1";
		const screenOne = makeScreen(1);
		vi.mocked(window.electronAPI.getScreenSources).mockResolvedValue([screenOne]);
		vi.mocked(window.electronAPI.getSelectedSource).mockResolvedValue(screenOne);

		render(
			<TooltipProvider>
				<LaunchWindow />
			</TooltipProvider>,
		);

		await screen.findByText("Screen 1");
		const readOnlyCamera = await screen.findByText("Camera One");
		fireEvent.pointerMove(readOnlyCamera);

		const cameraSelect = screen.getByLabelText("Webcam source");
		fireEvent.change(cameraSelect, { target: { value: "cam-2" } });

		expect(deviceHookMocks.setSelectedCameraId).toHaveBeenCalledWith("cam-2");
		expect(screen.getByText("Camera Two")).toBeInTheDocument();
		expect(screen.queryByLabelText("Webcam source")).not.toBeInTheDocument();
	});

	it("returns webcam controls to readonly after leaving an unchanged open selector", async () => {
		deviceHookMocks.cameraDevices = [
			{ deviceId: "cam-1", label: "Camera One" },
			{ deviceId: "cam-2", label: "Camera Two" },
		];
		deviceHookMocks.selectedCameraId = "cam-1";
		const screenOne = makeScreen(1);
		vi.mocked(window.electronAPI.getScreenSources).mockResolvedValue([screenOne]);
		vi.mocked(window.electronAPI.getSelectedSource).mockResolvedValue(screenOne);

		render(
			<TooltipProvider>
				<LaunchWindow />
			</TooltipProvider>,
		);

		await screen.findByText("Screen 1");
		const readOnlyCamera = await screen.findByText("Camera One");
		fireEvent.pointerMove(readOnlyCamera);

		const cameraSelect = screen.getByLabelText("Webcam source");
		fireEvent.focus(cameraSelect);
		const webcamPanel = cameraSelect.closest("[style*='width: 430px']");
		expect(webcamPanel).toBeTruthy();

		vi.useFakeTimers();
		fireEvent.mouseLeave(webcamPanel as Element);
		act(() => {
			vi.advanceTimersByTime(120);
		});

		expect(screen.queryByLabelText("Webcam source")).not.toBeInTheDocument();
		expect(screen.getByText("Camera One")).toBeInTheDocument();
	});

	it("collapses destination controls to read-only when pressing Enter in the stream key field", async () => {
		const screenOne = makeScreen(1);
		vi.mocked(window.electronAPI.getScreenSources).mockResolvedValue([screenOne]);
		vi.mocked(window.electronAPI.getSelectedSource).mockResolvedValue(screenOne);

		render(
			<TooltipProvider>
				<LaunchWindow />
			</TooltipProvider>,
		);

		await screen.findByText("Screen 1");
		const readOnlyDestination = screen.getByText("rtmp://a.rtmp.youtube.com/live2");
		fireEvent.pointerMove(readOnlyDestination);

		const streamKey = screen.getByLabelText("Stream key");
		fireEvent.change(streamKey, { target: { value: "abc123" } });
		fireEvent.keyDown(streamKey, { key: "Enter" });

		expect(screen.queryByLabelText("Server URL")).not.toBeInTheDocument();
		expect(screen.queryByLabelText("Stream key")).not.toBeInTheDocument();
		const collapsedDestination = screen.getByText("rtmp://a.rtmp.youtube.com/live2");
		expect(collapsedDestination).toBeInTheDocument();

		fireEvent.pointerMove(collapsedDestination, { movementX: 0, movementY: 0 });
		expect(screen.queryByLabelText("Server URL")).not.toBeInTheDocument();

		fireEvent.pointerMove(collapsedDestination, { movementX: 1, movementY: 0 });
		expect(screen.getByLabelText("Server URL")).toBeInTheDocument();
	});

	it("does not expand webcam controls from layout-induced mouse enter after destination collapses", async () => {
		deviceHookMocks.cameraDevices = [{ deviceId: "cam-1", label: "Camera One" }];
		deviceHookMocks.selectedCameraId = "cam-1";
		const screenOne = makeScreen(1);
		vi.mocked(window.electronAPI.getScreenSources).mockResolvedValue([screenOne]);
		vi.mocked(window.electronAPI.getSelectedSource).mockResolvedValue(screenOne);

		render(
			<TooltipProvider>
				<LaunchWindow />
			</TooltipProvider>,
		);

		await screen.findByText("Screen 1");
		const readOnlyDestination = screen.getByText("rtmp://a.rtmp.youtube.com/live2");
		fireEvent.pointerMove(readOnlyDestination);

		const streamKey = screen.getByLabelText("Stream key");
		fireEvent.change(streamKey, { target: { value: "abc123" } });
		fireEvent.keyDown(streamKey, { key: "Enter" });

		const readOnlyCamera = screen.getByText("Camera One");
		fireEvent.mouseEnter(readOnlyCamera);
		expect(screen.queryByLabelText("Webcam source")).not.toBeInTheDocument();

		fireEvent.pointerMove(readOnlyCamera);
		expect(screen.getByLabelText("Webcam source")).toBeInTheDocument();
	});

	it("does not immediately flip destination controls back to readonly on transient mouse leave", async () => {
		const screenOne = makeScreen(1);
		vi.mocked(window.electronAPI.getScreenSources).mockResolvedValue([screenOne]);
		vi.mocked(window.electronAPI.getSelectedSource).mockResolvedValue(screenOne);

		render(
			<TooltipProvider>
				<LaunchWindow />
			</TooltipProvider>,
		);

		await screen.findByText("Screen 1");
		const readOnlyDestination = screen.getByText("rtmp://a.rtmp.youtube.com/live2");
		const destinationPanel = readOnlyDestination.closest("[data-hud-interactive='true']");
		expect(destinationPanel).toBeTruthy();

		vi.useFakeTimers();
		fireEvent.pointerMove(destinationPanel as Element);
		expect(screen.getByLabelText("Server URL")).toBeInTheDocument();

		fireEvent.mouseLeave(destinationPanel as Element);
		expect(screen.getByLabelText("Server URL")).toBeInTheDocument();

		act(() => {
			vi.advanceTimersByTime(119);
		});
		expect(screen.getByLabelText("Server URL")).toBeInTheDocument();

		act(() => {
			vi.advanceTimersByTime(1);
		});
		expect(screen.queryByLabelText("Server URL")).not.toBeInTheDocument();
	});
});
