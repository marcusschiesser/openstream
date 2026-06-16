import { type ChildProcessWithoutNullStreams, spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import type { DesktopCapturerSource } from "electron";
import { app, clipboard, desktopCapturer, ipcMain, shell, systemPreferences } from "electron";
import {
	createYouTubeLiveStream,
	getYouTubeAuthStatus,
	getYouTubeBroadcastStatus,
	startYouTubeAuth,
} from "../youtubeLive";

const FFMPEG_LIVE_STREAM_AUDIO_BITRATE = "160k";
const FFMPEG_LIVE_STREAM_FPS = "30";
const FFMPEG_LIVE_STREAM_STOP_GRACE_MS = 2000;
const nodeRequire = createRequire(import.meta.url);

type SelectedSource = {
	id: string;
	name: string;
	display_id: string;
	thumbnail: string | null;
};

type StartLiveStreamInput = {
	destinationUrl: string;
	width: number;
	height: number;
	videoBitrateKbps: number;
};

type IpcResult<T extends object = object> =
	| ({ success: true } & T)
	| { success: false; error: string };

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
	};
}

function isScreenSource(source: Pick<SelectedSource, "id">): boolean {
	return source.id.startsWith("screen:");
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

function isExpectedLiveStreamPipeError(error: NodeJS.ErrnoException): boolean {
	return error.code === "EPIPE" || error.code === "ERR_STREAM_DESTROYED";
}

function getErrorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

async function runIpcTask<T extends object = object>(
	task: () => Promise<T | void>,
): Promise<IpcResult<T>> {
	try {
		const result = await task();
		return { success: true, ...(result ?? {}) } as { success: true } & T;
	} catch (error) {
		return { success: false, error: getErrorMessage(error) };
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

	if (!proc.stdin.destroyed && !proc.stdin.writableEnded) {
		try {
			proc.stdin.end();
		} catch (error) {
			const streamError = error as NodeJS.ErrnoException;
			if (!isExpectedLiveStreamPipeError(streamError)) {
				throw error;
			}
		}
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

export function registerIpcHandlers(getMainWindow: () => Electron.BrowserWindow | null) {
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
				if (mainWin && !mainWin.isDestroyed() && mainWin.isVisible() && !mainWin.isMinimized()) {
					mainWin.focus();
					app.focus({ steal: true });
				}
				return { success: true, granted: false, status: "not-determined" };
			}

			return { success: true, granted: false, status };
		} catch (error) {
			console.error("Failed to request screen access:", error);
			return { success: false, granted: false, status: "unknown", error: String(error) };
		}
	}

	ipcMain.handle("get-screen-sources", async () => {
		const sources = await desktopCapturer.getSources({
			types: ["screen"],
			thumbnailSize: { width: 320, height: 180 },
			fetchWindowIcons: false,
		});
		lastEnumeratedSources = new Map(sources.map((source) => [source.id, source]));
		if (!selectedSource || !sources.some((source) => source.id === selectedSource?.id)) {
			const firstScreen = sources[0] ?? null;
			selectedDesktopSource = firstScreen;
			selectedSource = firstScreen ? serializeDesktopSource(firstScreen) : null;
		}
		return sources.map(serializeDesktopSource);
	});

	ipcMain.handle("select-source", async (_, source: SelectedSource) => {
		if (!isScreenSource(source)) {
			return selectedSource;
		}
		selectedSource = source;
		selectedDesktopSource = lastEnumeratedSources.get(source.id) ?? null;

		if (!selectedDesktopSource) {
			try {
				const sources = await desktopCapturer.getSources({
					types: ["screen"],
					thumbnailSize: { width: 0, height: 0 },
					fetchWindowIcons: false,
				});
				lastEnumeratedSources = new Map(sources.map((candidate) => [candidate.id, candidate]));
				selectedDesktopSource = lastEnumeratedSources.get(source.id) ?? null;
			} catch {
				selectedDesktopSource = null;
			}
		}

		return selectedSource;
	});

	ipcMain.handle("get-selected-source", () => selectedSource);

	ipcMain.handle("capture-selected-source-preview", async () => {
		if (!selectedSource?.id) {
			return null;
		}

		const mainWin = getMainWindow();
		const shouldHideMainWin = mainWin && !mainWin.isDestroyed() && mainWin.isVisible();

		try {
			if (shouldHideMainWin) mainWin.hide();
			if (shouldHideMainWin) {
				await delay(180);
			}

			const sources = await desktopCapturer.getSources({
				types: ["screen"],
				thumbnailSize: { width: 1280, height: 720 },
				fetchWindowIcons: false,
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

	ipcMain.handle("open-external-url", async (_, url: string) =>
		runIpcTask(async () => {
			await shell.openExternal(url);
		}),
	);

	ipcMain.handle("copy-to-clipboard", async (_, text: string) =>
		runIpcTask(async () => {
			clipboard.writeText(String(text ?? ""));
		}),
	);

	ipcMain.handle("get-platform", () => process.platform);

	ipcMain.handle("youtube-auth-status", () => getYouTubeAuthStatus());

	ipcMain.handle("youtube-auth-start", async () =>
		runIpcTask(async () => {
			await startYouTubeAuth();
		}),
	);

	ipcMain.handle("youtube-create-live-stream", async () =>
		runIpcTask(async () => ({ liveStream: await createYouTubeLiveStream() })),
	);

	ipcMain.handle("youtube-get-broadcast-status", async (_, input: { broadcastId: string }) =>
		runIpcTask(async () => {
			return await getYouTubeBroadcastStatus(input);
		}),
	);

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

		proc.stdin.on("error", (error: NodeJS.ErrnoException) => {
			if (isExpectedLiveStreamPipeError(error) && liveStreamStopping) {
				return;
			}
			liveStreamStderr = `${liveStreamStderr}\n${error.message}`.trim();
			if (!isExpectedLiveStreamPipeError(error)) {
				console.error("Live stream FFmpeg stdin error:", error);
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
		if (liveStreamStopping) {
			return { success: true };
		}
		if (!proc || proc.stdin.destroyed || proc.stdin.writableEnded || !proc.stdin.writable) {
			return { success: false, error: liveStreamStderr.trim() || "Live stream is not running." };
		}

		const buffer = Buffer.from(new Uint8Array(chunk));
		if (buffer.length === 0) {
			return { success: true };
		}

		return await new Promise<{ success: boolean; error?: string }>((resolve) => {
			let settled = false;
			const finish = (result: { success: boolean; error?: string }) => {
				if (settled) return;
				settled = true;
				proc.stdin.off("error", onError);
				resolve(result);
			};
			const onError = (error: NodeJS.ErrnoException) => {
				if (isExpectedLiveStreamPipeError(error) && liveStreamStopping) {
					finish({ success: true });
					return;
				}
				finish({ success: false, error: error.message });
			};
			proc.stdin.once("error", onError);
			try {
				proc.stdin.write(buffer, (error?: Error | null) => {
					if (error) {
						onError(error as NodeJS.ErrnoException);
						return;
					}
					finish({ success: true });
				});
			} catch (error) {
				onError(error as NodeJS.ErrnoException);
			}
		});
	});

	ipcMain.handle("stop-live-stream", async () => stopLiveStreamProcess());
}
