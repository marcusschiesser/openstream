import { type ChildProcessWithoutNullStreams, spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import type { DesktopCapturerSource } from "electron";
import {
	app,
	BrowserWindow,
	desktopCapturer,
	dialog,
	ipcMain,
	shell,
	systemPreferences,
} from "electron";

const FFMPEG_LIVE_STREAM_AUDIO_BITRATE = "160k";
const FFMPEG_LIVE_STREAM_FPS = "30";
const FFMPEG_LIVE_STREAM_STOP_GRACE_MS = 2000;
const nodeRequire = createRequire(import.meta.url);

type SelectedSource = {
	id: string;
	name: string;
	display_id: string;
	thumbnail: string | null;
	appIcon: string | null;
};

type StartLiveStreamInput = {
	destinationUrl: string;
	width: number;
	height: number;
	videoBitrateKbps: number;
};

let selectedSource: SelectedSource | null = null;
let selectedDesktopSource: DesktopCapturerSource | null = null;
let lastEnumeratedSources = new Map<string, DesktopCapturerSource>();
let liveStreamProcess: ChildProcessWithoutNullStreams | null = null;
let liveStreamStopping = false;
let liveStreamStderr = "";

export function getSelectedDesktopSource(): DesktopCapturerSource | null {
	return selectedDesktopSource;
}

function delay(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

function serializeDesktopSource(source: DesktopCapturerSource): SelectedSource {
	return {
		id: source.id,
		name: source.name,
		display_id: source.display_id,
		thumbnail: source.thumbnail ? source.thumbnail.toDataURL() : null,
		appIcon: source.appIcon ? source.appIcon.toDataURL() : null,
	};
}

function resolveFfmpegPath(): string | null {
	try {
		const ffmpegStaticPath = nodeRequire("ffmpeg-static");
		if (typeof ffmpegStaticPath !== "string" || ffmpegStaticPath.length === 0) {
			return null;
		}

		const unpackedPath = ffmpegStaticPath.replace("app.asar", "app.asar.unpacked");
		if (unpackedPath !== ffmpegStaticPath && existsSync(unpackedPath)) {
			return unpackedPath;
		}

		return ffmpegStaticPath;
	} catch (error) {
		console.error("Failed to resolve bundled FFmpeg path:", error);
		return null;
	}
}

function waitForLiveStreamExit(): Promise<{ code: number | null; signal: NodeJS.Signals | null }> {
	const proc = liveStreamProcess;
	if (!proc) {
		return Promise.resolve({ code: null, signal: null });
	}

	return new Promise((resolve) => {
		proc.once("close", (code, signal) => resolve({ code, signal }));
	});
}

function liveStreamStopTimeout(ms: number) {
	return new Promise<{ code: number | null; signal: NodeJS.Signals | null }>((resolve) => {
		setTimeout(() => resolve({ code: null, signal: null }), ms);
	});
}

async function stopLiveStreamProcess() {
	const proc = liveStreamProcess;
	if (!proc) {
		liveStreamStopping = false;
		liveStreamStderr = "";
		return { success: true };
	}

	liveStreamStopping = true;
	const exitPromise = waitForLiveStreamExit();

	if (!proc.stdin.destroyed) {
		proc.stdin.end();
	}

	let timeoutId: ReturnType<typeof setTimeout> | null = null;
	const timeoutPromise = new Promise<{ code: number | null; signal: NodeJS.Signals | null }>(
		(resolve) => {
			timeoutId = setTimeout(() => {
				if (!proc.killed) {
					proc.kill("SIGTERM");
				}
				resolve({ code: null, signal: "SIGTERM" });
			}, 5000);
		},
	);
	const result = await Promise.race([exitPromise, timeoutPromise]);
	if (timeoutId) {
		clearTimeout(timeoutId);
	}
	const finalResult =
		result.signal === "SIGTERM" && liveStreamProcess === proc
			? await Promise.race([exitPromise, liveStreamStopTimeout(FFMPEG_LIVE_STREAM_STOP_GRACE_MS)])
			: result;

	const timedOutWhileStopping = finalResult.code === null && finalResult.signal === null;
	if (!timedOutWhileStopping && liveStreamProcess === proc) {
		liveStreamProcess = null;
	}
	liveStreamStopping = false;
	const stderr = liveStreamStderr;
	liveStreamStderr = "";

	if (finalResult.code === 0 || finalResult.signal === "SIGTERM") {
		return { success: true };
	}

	return {
		success: false,
		error:
			stderr.trim() ||
			(timedOutWhileStopping
				? "Timed out while stopping live stream process."
				: `FFmpeg exited with code ${finalResult.code ?? "unknown"}`),
	};
}

export function registerIpcHandlers(
	createSourceSelectorWindow: () => BrowserWindow,
	getMainWindow: () => BrowserWindow | null,
	getSourceSelectorWindow: () => BrowserWindow | null,
) {
	async function requestScreenAccess() {
		if (process.platform !== "darwin") {
			return { success: true, granted: true, status: "granted" };
		}

		try {
			const status = systemPreferences.getMediaAccessStatus("screen");
			if (status === "granted") {
				return { success: true, granted: true, status };
			}

			if (status === "not-determined") {
				const mainWin = getMainWindow();
				if (mainWin && !mainWin.isDestroyed()) {
					if (!mainWin.isVisible()) {
						mainWin.show();
					}
					mainWin.focus();
				}
				app.focus({ steal: true });
				desktopCapturer
					.getSources({ types: ["screen"], thumbnailSize: { width: 1, height: 1 } })
					.catch(() => undefined);
				return { success: true, granted: false, status: "not-determined" };
			}

			return { success: true, granted: false, status };
		} catch (error) {
			console.error("Failed to request screen access:", error);
			return { success: false, granted: false, status: "unknown", error: String(error) };
		}
	}

	ipcMain.handle("get-sources", async (_, opts: Electron.SourcesOptions) => {
		const sources = await desktopCapturer.getSources(opts);
		lastEnumeratedSources = new Map(sources.map((source) => [source.id, source]));
		return sources.map(serializeDesktopSource);
	});

	ipcMain.handle("select-source", async (_, source: SelectedSource) => {
		selectedSource = source;
		selectedDesktopSource = lastEnumeratedSources.get(source.id) ?? null;

		if (!selectedDesktopSource) {
			try {
				const sources = await desktopCapturer.getSources({
					types: ["screen", "window"],
					thumbnailSize: { width: 0, height: 0 },
					fetchWindowIcons: true,
				});
				lastEnumeratedSources = new Map(sources.map((candidate) => [candidate.id, candidate]));
				selectedDesktopSource = lastEnumeratedSources.get(source.id) ?? null;
			} catch {
				selectedDesktopSource = null;
			}
		}

		getSourceSelectorWindow()?.close();
		return selectedSource;
	});

	ipcMain.handle("get-selected-source", () => selectedSource);

	ipcMain.handle("capture-selected-source-preview", async () => {
		if (!selectedSource?.id) {
			return null;
		}

		const isScreenSource = selectedSource.id.startsWith("screen:");
		const mainWin = getMainWindow();
		const sourceSelectorWin = getSourceSelectorWindow();
		const shouldHideMainWin =
			isScreenSource && mainWin && !mainWin.isDestroyed() && mainWin.isVisible();
		const shouldHideSourceSelectorWin =
			isScreenSource &&
			sourceSelectorWin &&
			!sourceSelectorWin.isDestroyed() &&
			sourceSelectorWin.isVisible();

		try {
			if (shouldHideMainWin) mainWin.hide();
			if (shouldHideSourceSelectorWin) sourceSelectorWin.hide();
			if (shouldHideMainWin || shouldHideSourceSelectorWin) {
				await delay(180);
			}

			const sources = await desktopCapturer.getSources({
				types: [isScreenSource ? "screen" : "window"],
				thumbnailSize: { width: 1280, height: 720 },
				fetchWindowIcons: true,
			});
			lastEnumeratedSources = new Map(sources.map((source) => [source.id, source]));
			const refreshedSource =
				lastEnumeratedSources.get(selectedSource.id) ??
				sources.find(
					(source) =>
						source.display_id &&
						selectedSource?.display_id &&
						source.display_id === selectedSource.display_id,
				) ??
				null;

			if (!refreshedSource) {
				return selectedSource;
			}

			selectedDesktopSource = refreshedSource;
			selectedSource = serializeDesktopSource(refreshedSource);
			return selectedSource;
		} finally {
			if (shouldHideSourceSelectorWin && sourceSelectorWin && !sourceSelectorWin.isDestroyed()) {
				sourceSelectorWin.showInactive();
			}
			if (shouldHideMainWin && mainWin && !mainWin.isDestroyed()) {
				mainWin.showInactive();
			}
		}
	});

	ipcMain.handle("request-camera-access", async () => {
		if (process.platform !== "darwin") {
			return { success: true, granted: true, status: "granted" };
		}

		try {
			const status = systemPreferences.getMediaAccessStatus("camera");
			if (status === "granted") {
				return { success: true, granted: true, status };
			}

			if (status === "not-determined") {
				const granted = await systemPreferences.askForMediaAccess("camera");
				return {
					success: true,
					granted,
					status: granted ? "granted" : systemPreferences.getMediaAccessStatus("camera"),
				};
			}

			return { success: true, granted: false, status };
		} catch (error) {
			console.error("Failed to request camera access:", error);
			return { success: false, granted: false, status: "unknown", error: String(error) };
		}
	});

	ipcMain.handle("request-screen-access", async () => requestScreenAccess());

	ipcMain.handle("open-source-selector", async () => {
		const access = await requestScreenAccess();
		if (!access.granted) {
			if (process.platform === "darwin" && access.status !== "not-determined") {
				const mainWin = getMainWindow();
				const messageOptions = {
					type: "warning",
					buttons: ["Open System Settings", "Cancel"],
					defaultId: 0,
					cancelId: 1,
					message: "Screen Recording permission is required",
					detail:
						"Allow OpenStream in macOS System Settings, then come back and choose a screen or window.",
				} satisfies Electron.MessageBoxOptions;
				const result =
					mainWin && !mainWin.isDestroyed()
						? await dialog.showMessageBox(mainWin, messageOptions)
						: await dialog.showMessageBox(messageOptions);
				if (result.response === 0) {
					await shell.openExternal(
						"x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture",
					);
				}
			}
			return { opened: false, reason: "screen-access-required", access };
		}

		const sourceSelectorWin = getSourceSelectorWindow();
		if (sourceSelectorWin) {
			sourceSelectorWin.focus();
			return { opened: true };
		}
		createSourceSelectorWindow();
		return { opened: true };
	});

	ipcMain.handle("open-external-url", async (_, url: string) => {
		try {
			await shell.openExternal(url);
			return { success: true };
		} catch (error) {
			return { success: false, error: String(error) };
		}
	});

	ipcMain.handle("get-platform", () => process.platform);

	ipcMain.handle("start-live-stream", async (_, input: StartLiveStreamInput) => {
		if (liveStreamProcess) {
			return { success: false, error: "A live stream is already running." };
		}

		const ffmpegPath = resolveFfmpegPath();
		if (!ffmpegPath) {
			return { success: false, error: "Bundled FFmpeg is not available." };
		}

		const width = Number.isFinite(input.width) ? Math.max(2, Math.round(input.width)) : 1920;
		const height = Number.isFinite(input.height) ? Math.max(2, Math.round(input.height)) : 1080;
		const videoBitrateKbps = Number.isFinite(input.videoBitrateKbps)
			? Math.max(500, Math.round(input.videoBitrateKbps))
			: 6000;
		const destinationUrl = String(input.destinationUrl ?? "").trim();
		const lowerDestinationUrl = destinationUrl.toLowerCase();
		const keyframeInterval = String(Number(FFMPEG_LIVE_STREAM_FPS) * 2);

		if (!lowerDestinationUrl.startsWith("rtmp://") && !lowerDestinationUrl.startsWith("rtmps://")) {
			return { success: false, error: "Destination URL must start with rtmp:// or rtmps://." };
		}

		liveStreamStopping = false;
		liveStreamStderr = "";

		const args = [
			"-hide_banner",
			"-loglevel",
			"warning",
			"-fflags",
			"+genpts",
			"-i",
			"pipe:0",
			"-vf",
			`scale=${width}:${height}:flags=lanczos,format=yuv420p`,
			"-r",
			FFMPEG_LIVE_STREAM_FPS,
			"-c:v",
			"libx264",
			"-preset",
			"veryfast",
			"-tune",
			"zerolatency",
			"-g",
			keyframeInterval,
			"-keyint_min",
			keyframeInterval,
			"-sc_threshold",
			"0",
			"-b:v",
			`${videoBitrateKbps}k`,
			"-maxrate",
			`${videoBitrateKbps}k`,
			"-bufsize",
			`${videoBitrateKbps * 2}k`,
			"-af",
			"aresample=async=1:first_pts=0",
			"-c:a",
			"aac",
			"-b:a",
			FFMPEG_LIVE_STREAM_AUDIO_BITRATE,
			"-ar",
			"48000",
			"-flvflags",
			"no_duration_filesize",
			"-f",
			"flv",
			destinationUrl,
		];

		let proc: ChildProcessWithoutNullStreams;
		try {
			proc = spawn(ffmpegPath, args, { stdio: ["pipe", "pipe", "pipe"] });
		} catch (error) {
			return { success: false, error: `Failed to start bundled FFmpeg: ${String(error)}` };
		}
		liveStreamProcess = proc;

		proc.stderr.on("data", (chunk) => {
			liveStreamStderr += chunk.toString();
			if (liveStreamStderr.length > 8000) {
				liveStreamStderr = liveStreamStderr.slice(-8000);
			}
		});

		proc.once("error", (error) => {
			if (liveStreamProcess === proc) {
				liveStreamProcess = null;
			}
			liveStreamStderr = String(error);
		});

		proc.once("close", (code) => {
			if (liveStreamProcess === proc) {
				liveStreamProcess = null;
			}
			if (!liveStreamStopping && code !== 0) {
				console.error("Live stream FFmpeg process exited:", liveStreamStderr);
			}
			liveStreamStopping = false;
		});

		return { success: true };
	});

	ipcMain.handle("write-live-stream-chunk", async (_, chunk: ArrayBuffer) => {
		const proc = liveStreamProcess;
		if (!proc || proc.stdin.destroyed) {
			return { success: false, error: liveStreamStderr.trim() || "Live stream is not running." };
		}

		const buffer = Buffer.from(new Uint8Array(chunk));
		if (buffer.length === 0) {
			return { success: true };
		}

		return await new Promise<{ success: boolean; error?: string }>((resolve) => {
			const onError = (error: Error) => resolve({ success: false, error: error.message });
			proc.stdin.once("error", onError);
			proc.stdin.write(buffer, () => {
				proc.stdin.off("error", onError);
				resolve({ success: true });
			});
		});
	});

	ipcMain.handle("stop-live-stream", async () => stopLiveStreamProcess());
}
