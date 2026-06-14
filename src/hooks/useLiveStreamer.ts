import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { computeCompositeLayout, type RenderRect } from "@/lib/compositeLayout";
import {
	getLiveStreamVideoBitrateKbps,
	joinRtmpsUrl,
	type LiveStreamStartConfig,
	validateLiveStreamDestination,
} from "@/lib/liveStream";

const TARGET_FRAME_RATE = 30;
const TARGET_WIDTH = 3840;
const TARGET_HEIGHT = 2160;
const MIN_FRAME_RATE = 30;
const CHROME_MEDIA_SOURCE = "desktop";
const LIVE_STREAM_TIMESLICE_MS = 500;
const AUDIO_BITRATE = 160_000;
const LIVE_AUDIO_SAMPLE_RATE = 48_000;
const LIVE_AUDIO_WARMUP_MS = 50;
const MIC_GAIN_BOOST = 1.4;
const YOUTUBE_BROADCAST_STATUS_POLL_MS = 2500;
const YOUTUBE_BROADCAST_LIVE_POLL_ATTEMPTS = 120;

type ProviderLiveStatus = {
	status: string | null;
	timerStarted: boolean;
	stopAllowed: boolean;
	startedAt: number | null;
};

type LiveStreamerDeviceConfig = {
	systemAudioEnabled: boolean;
	microphoneEnabled: boolean;
	microphoneDeviceId?: string;
	webcamEnabled: boolean;
	webcamDeviceId?: string;
	onProviderWatchUrl?: (watchUrl: string) => void;
	onProviderStatus?: (status: ProviderLiveStatus) => void;
};

type ActiveLiveStream = {
	recorder: MediaRecorder;
	drawFrame: number;
	canvasStream: MediaStream;
	screenStream: MediaStream;
	microphoneStream: MediaStream | null;
	webcamStream: MediaStream | null;
	mixingContext: AudioContext | null;
	screenVideo: HTMLVideoElement;
	webcamVideo: HTMLVideoElement | null;
};

type YouTubeLiveStreamMetadata = {
	broadcastId: string;
	streamId: string;
	watchUrl: string;
	ingestionUrl: string;
};

export type UseLiveStreamerReturn = {
	streaming: boolean;
	providerTimerStarted: boolean;
	providerStopAllowed: boolean;
	providerStatus: string | null;
	streamElapsedSeconds: number;
	startLiveStream: (config: LiveStreamStartConfig) => Promise<boolean>;
	stopLiveStream: () => Promise<void>;
};

function selectLiveMimeType() {
	const preferred = [
		"video/webm;codecs=h264,opus",
		"video/webm;codecs=vp8,opus",
		"video/webm;codecs=vp9,opus",
		"video/webm",
	];

	return preferred.find((type) => MediaRecorder.isTypeSupported(type)) ?? "video/webm";
}

function drawImageCover(
	context: CanvasRenderingContext2D,
	source: CanvasImageSource,
	sourceWidth: number,
	sourceHeight: number,
	rect: RenderRect,
) {
	const scale = Math.max(rect.width / sourceWidth, rect.height / sourceHeight);
	const width = sourceWidth * scale;
	const height = sourceHeight * scale;
	const x = rect.x + (rect.width - width) / 2;
	const y = rect.y + (rect.height - height) / 2;
	context.drawImage(source, x, y, width, height);
}

function drawRoundedRectPath(context: CanvasRenderingContext2D, rect: RenderRect, radius: number) {
	const normalizedRadius = Math.max(0, Math.min(radius, rect.width / 2, rect.height / 2));
	context.beginPath();
	context.moveTo(rect.x + normalizedRadius, rect.y);
	context.lineTo(rect.x + rect.width - normalizedRadius, rect.y);
	context.quadraticCurveTo(
		rect.x + rect.width,
		rect.y,
		rect.x + rect.width,
		rect.y + normalizedRadius,
	);
	context.lineTo(rect.x + rect.width, rect.y + rect.height - normalizedRadius);
	context.quadraticCurveTo(
		rect.x + rect.width,
		rect.y + rect.height,
		rect.x + rect.width - normalizedRadius,
		rect.y + rect.height,
	);
	context.lineTo(rect.x + normalizedRadius, rect.y + rect.height);
	context.quadraticCurveTo(
		rect.x,
		rect.y + rect.height,
		rect.x,
		rect.y + rect.height - normalizedRadius,
	);
	context.lineTo(rect.x, rect.y + normalizedRadius);
	context.quadraticCurveTo(rect.x, rect.y, rect.x + normalizedRadius, rect.y);
	context.closePath();
}

function stopStream(stream: MediaStream | null) {
	stream?.getTracks().forEach((track) => {
		track.stop();
	});
}

async function createVideoElement(stream: MediaStream): Promise<HTMLVideoElement> {
	const video = document.createElement("video");
	video.srcObject = stream;
	video.muted = true;
	video.playsInline = true;

	await new Promise<void>((resolve, reject) => {
		const timeout = window.setTimeout(() => {
			cleanup();
			reject(new Error("Timed out while preparing live preview media."));
		}, 5000);
		const cleanup = () => {
			window.clearTimeout(timeout);
			video.removeEventListener("loadedmetadata", onLoadedMetadata);
			video.removeEventListener("error", onError);
		};
		const onLoadedMetadata = () => {
			cleanup();
			resolve();
		};
		const onError = () => {
			cleanup();
			reject(new Error("Failed to prepare live preview media."));
		};
		video.addEventListener("loadedmetadata", onLoadedMetadata);
		video.addEventListener("error", onError);
	});

	await video.play();
	return video;
}

export function useLiveStreamer(deviceConfig: LiveStreamerDeviceConfig): UseLiveStreamerReturn {
	const [streaming, setStreaming] = useState(false);
	const [providerTimerStarted, setProviderTimerStarted] = useState(false);
	const [providerStopAllowed, setProviderStopAllowed] = useState(false);
	const [providerStatus, setProviderStatus] = useState<string | null>(null);
	const [streamElapsedSeconds, setStreamElapsedSeconds] = useState(0);
	const activeStream = useRef<ActiveLiveStream | null>(null);
	const startedAt = useRef<number | null>(null);
	const stopping = useRef(false);
	const chunkWriteQueue = useRef<Promise<void>>(Promise.resolve());

	const cleanupActiveStream = useCallback(() => {
		const active = activeStream.current;
		if (!active) {
			return;
		}

		cancelAnimationFrame(active.drawFrame);
		if (active.recorder.state !== "inactive") {
			try {
				active.recorder.stop();
			} catch {
				// Recorder may already be stopping.
			}
		}
		stopStream(active.canvasStream);
		stopStream(active.screenStream);
		stopStream(active.microphoneStream);
		stopStream(active.webcamStream);
		active.mixingContext?.close().catch(() => undefined);
		active.screenVideo.srcObject = null;
		if (active.webcamVideo) {
			active.webcamVideo.srcObject = null;
		}
		activeStream.current = null;
	}, []);

	const stopLiveStream = useCallback(async () => {
		if (stopping.current) {
			return;
		}
		stopping.current = true;
		cleanupActiveStream();
		try {
			const result = await window.electronAPI.stopLiveStream();
			if (!result.success && result.error) {
				toast.error(result.error);
			}
		} finally {
			startedAt.current = null;
			setProviderTimerStarted(false);
			setProviderStopAllowed(false);
			setProviderStatus(null);
			setStreaming(false);
			setStreamElapsedSeconds(0);
			stopping.current = false;
		}
	}, [cleanupActiveStream]);

	const publishProviderStatus = useCallback(
		(status: ProviderLiveStatus) => {
			setProviderStatus(status.status);
			setProviderTimerStarted(status.timerStarted);
			setProviderStopAllowed(status.stopAllowed);
			if (status.startedAt !== null) {
				startedAt.current = status.startedAt;
				setStreamElapsedSeconds(Math.max(0, Math.floor((Date.now() - status.startedAt) / 1000)));
			}
			deviceConfig.onProviderStatus?.(status);
		},
		[deviceConfig.onProviderStatus],
	);

	const waitForYouTubeLiveStatus = useCallback(
		async (liveStream: YouTubeLiveStreamMetadata) => {
			const stopAfterYouTubeStatusError = async (message: string) => {
				if (stopping.current) {
					return;
				}
				toast.error(message);
				try {
					await stopLiveStream();
				} catch (error) {
					console.warn("Failed to stop live stream after YouTube status error:", error);
				}
			};

			try {
				let timerStarted = false;
				let timerStartedAt: number | null = null;
				let lastStatus: string | null = null;
				for (let attempt = 0; attempt < YOUTUBE_BROADCAST_LIVE_POLL_ATTEMPTS; attempt += 1) {
					if (stopping.current) {
						return;
					}
					const result = await window.electronAPI.youtubeGetBroadcastStatus({
						broadcastId: liveStream.broadcastId,
					});
					if (!result.success) {
						await stopAfterYouTubeStatusError(
							result.error ?? "Unable to check YouTube broadcast status.",
						);
						return;
					}

					const lifeCycleStatus = result.lifeCycleStatus;
					const readyOrLater =
						lifeCycleStatus === "ready" ||
						lifeCycleStatus === "liveStarting" ||
						lifeCycleStatus === "live";
					if (readyOrLater && !timerStarted) {
						timerStarted = true;
						timerStartedAt = Date.now();
					}

					if (lifeCycleStatus !== lastStatus) {
						lastStatus = lifeCycleStatus;
						publishProviderStatus({
							status: lifeCycleStatus,
							timerStarted,
							stopAllowed: lifeCycleStatus === "live",
							startedAt: timerStartedAt,
						});
						timerStartedAt = null;
					}

					if (lifeCycleStatus === "live") {
						return;
					}
					await new Promise((resolve) =>
						window.setTimeout(resolve, YOUTUBE_BROADCAST_STATUS_POLL_MS),
					);
				}

				await stopAfterYouTubeStatusError("YouTube did not report the broadcast as live in time.");
			} catch (error) {
				await stopAfterYouTubeStatusError(
					error instanceof Error ? error.message : "Unable to check YouTube broadcast status.",
				);
			}
		},
		[publishProviderStatus, stopLiveStream],
	);

	const captureScreenStream = useCallback(async () => {
		const selectedSource = await window.electronAPI.getSelectedSource();
		if (!selectedSource) {
			throw new Error("Please select a source to stream.");
		}

		const platform = await window.electronAPI.getPlatform();
		if (platform === "win32") {
			return await navigator.mediaDevices.getDisplayMedia({
				video: {
					cursor: "always",
					width: { max: TARGET_WIDTH },
					height: { max: TARGET_HEIGHT },
					frameRate: { ideal: TARGET_FRAME_RATE },
				} as MediaTrackConstraints,
				audio: deviceConfig.systemAudioEnabled,
			} as DisplayMediaStreamOptions);
		}

		const videoConstraints = {
			mandatory: {
				chromeMediaSource: CHROME_MEDIA_SOURCE,
				chromeMediaSourceId: selectedSource.id,
				maxWidth: TARGET_WIDTH,
				maxHeight: TARGET_HEIGHT,
				maxFrameRate: TARGET_FRAME_RATE,
				minFrameRate: MIN_FRAME_RATE,
			},
		};

		if (!deviceConfig.systemAudioEnabled) {
			return await navigator.mediaDevices.getUserMedia({
				audio: false,
				video: videoConstraints,
			} as unknown as MediaStreamConstraints);
		}

		try {
			return await navigator.mediaDevices.getUserMedia({
				audio: {
					mandatory: {
						chromeMediaSource: CHROME_MEDIA_SOURCE,
						chromeMediaSourceId: selectedSource.id,
					},
				},
				video: videoConstraints,
			} as unknown as MediaStreamConstraints);
		} catch (error) {
			console.warn("System audio capture failed for live stream:", error);
			toast.error("System audio is unavailable. Streaming video without system audio.");
			return await navigator.mediaDevices.getUserMedia({
				audio: false,
				video: videoConstraints,
			} as unknown as MediaStreamConstraints);
		}
	}, [deviceConfig.systemAudioEnabled]);

	const captureMicrophoneStream = useCallback(async () => {
		if (!deviceConfig.microphoneEnabled) {
			return null;
		}

		try {
			return await navigator.mediaDevices.getUserMedia({
				audio: deviceConfig.microphoneDeviceId
					? {
							deviceId: { exact: deviceConfig.microphoneDeviceId },
							echoCancellation: true,
							noiseSuppression: true,
							autoGainControl: true,
						}
					: {
							echoCancellation: true,
							noiseSuppression: true,
							autoGainControl: true,
						},
				video: false,
			});
		} catch (error) {
			console.warn("Microphone capture failed for live stream:", error);
			toast.error("Microphone is unavailable. Streaming without microphone audio.");
			return null;
		}
	}, [deviceConfig.microphoneDeviceId, deviceConfig.microphoneEnabled]);

	const captureWebcamStream = useCallback(async () => {
		if (!deviceConfig.webcamEnabled) {
			return null;
		}

		try {
			return await navigator.mediaDevices.getUserMedia({
				audio: false,
				video: deviceConfig.webcamDeviceId
					? {
							deviceId: { exact: deviceConfig.webcamDeviceId },
							width: { ideal: 1280 },
							height: { ideal: 720 },
							frameRate: { ideal: TARGET_FRAME_RATE, max: TARGET_FRAME_RATE },
						}
					: {
							width: { ideal: 1280 },
							height: { ideal: 720 },
							frameRate: { ideal: TARGET_FRAME_RATE, max: TARGET_FRAME_RATE },
						},
			});
		} catch (error) {
			console.warn("Webcam capture failed for live stream:", error);
			toast.error("Webcam is unavailable. Streaming without webcam.");
			return null;
		}
	}, [deviceConfig.webcamDeviceId, deviceConfig.webcamEnabled]);

	const buildAudioTrack = useCallback(
		async (
			screenStream: MediaStream,
			microphoneStream: MediaStream | null,
		): Promise<{ track: MediaStreamTrack | null; context: AudioContext | null }> => {
			const systemAudioTrack = screenStream.getAudioTracks()[0] ?? null;
			const microphoneTrack = microphoneStream?.getAudioTracks()[0] ?? null;
			const context = new AudioContext({ sampleRate: LIVE_AUDIO_SAMPLE_RATE });
			const destination = context.createMediaStreamDestination();
			const silence = new ConstantSourceNode(context, { offset: 0 });
			silence.connect(destination);
			silence.start();

			if (systemAudioTrack) {
				const systemSource = context.createMediaStreamSource(new MediaStream([systemAudioTrack]));
				systemSource.connect(destination);
			}

			if (microphoneTrack) {
				const micSource = context.createMediaStreamSource(new MediaStream([microphoneTrack]));
				const micGain = context.createGain();
				micGain.gain.value = MIC_GAIN_BOOST;
				micSource.connect(micGain).connect(destination);
			}

			if (context.state === "suspended") {
				await context.resume();
			}

			return { track: destination.stream.getAudioTracks()[0] ?? null, context };
		},
		[],
	);

	const startLiveStream = useCallback(
		async (config: LiveStreamStartConfig) => {
			if (streaming) {
				return false;
			}

			const validationError = validateLiveStreamDestination(config.destination);
			if (validationError) {
				toast.error(validationError);
				return false;
			}

			let screenStream: MediaStream | null = null;
			let microphoneStream: MediaStream | null = null;
			let webcamStream: MediaStream | null = null;
			let mixingContext: AudioContext | null = null;
			chunkWriteQueue.current = Promise.resolve();

			try {
				screenStream = await captureScreenStream();
				microphoneStream = await captureMicrophoneStream();
				webcamStream = await captureWebcamStream();

				const screenVideo = await createVideoElement(screenStream);
				const webcamVideo = webcamStream ? await createVideoElement(webcamStream) : null;
				const screenTrack = screenStream.getVideoTracks()[0];
				if (!screenTrack) {
					throw new Error("Selected source does not have a video track.");
				}
				screenTrack.addEventListener(
					"ended",
					() => {
						if (!stopping.current) {
							void stopLiveStream();
						}
					},
					{ once: true },
				);

				const screenSettings = screenTrack.getSettings();
				const screenSize = {
					width: screenVideo.videoWidth || screenSettings.width || TARGET_WIDTH,
					height: screenVideo.videoHeight || screenSettings.height || TARGET_HEIGHT,
				};
				const videoBitrateKbps = getLiveStreamVideoBitrateKbps(screenSize);
				let youtubeLiveStream: YouTubeLiveStreamMetadata | null = null;
				let destinationUrl: string;
				if (config.destination.provider === "youtube") {
					const result = await window.electronAPI.youtubeCreateLiveStream();
					if (!result.success || !result.liveStream) {
						throw new Error(result.error ?? "Failed to create YouTube live stream.");
					}
					youtubeLiveStream = result.liveStream;
					deviceConfig.onProviderWatchUrl?.(result.liveStream.watchUrl);
					destinationUrl = result.liveStream.ingestionUrl;
				} else {
					destinationUrl = joinRtmpsUrl(config.destination.serverUrl, config.destination.streamKey);
				}
				const startResult = await window.electronAPI.startLiveStream({
					destinationUrl,
					width: screenSize.width,
					height: screenSize.height,
					videoBitrateKbps,
				});

				if (!startResult.success) {
					throw new Error(startResult.error ?? "Failed to start live stream encoder.");
				}

				const webcamSize =
					webcamVideo && webcamVideo.videoWidth > 0 && webcamVideo.videoHeight > 0
						? { width: webcamVideo.videoWidth, height: webcamVideo.videoHeight }
						: null;

				const canvas = document.createElement("canvas");
				canvas.width = screenSize.width;
				canvas.height = screenSize.height;
				const context = canvas.getContext("2d");
				if (!context) {
					throw new Error("Unable to create live stream canvas.");
				}

				let lastDraw = 0;
				const draw = (time: number) => {
					const intervalMs = 1000 / TARGET_FRAME_RATE;
					if (time - lastDraw >= intervalMs) {
						lastDraw = time;
						context.fillStyle = "#050609";
						context.fillRect(0, 0, canvas.width, canvas.height);

						const layout = computeCompositeLayout({
							canvasSize: { width: canvas.width, height: canvas.height },
							screenSize,
							webcamSize,
							layoutPreset: webcamVideo ? "picture-in-picture" : "no-webcam",
							webcamMaskShape: config.layout.webcamMaskShape,
							webcamSizePreset: config.layout.webcamSizePreset,
							webcamPosition: config.layout.webcamPosition,
						});

						const screenRect = layout?.screenRect ?? {
							x: 0,
							y: 0,
							width: canvas.width,
							height: canvas.height,
						};
						if (layout?.screenCover) {
							drawImageCover(context, screenVideo, screenSize.width, screenSize.height, screenRect);
						} else {
							context.drawImage(
								screenVideo,
								screenRect.x,
								screenRect.y,
								screenRect.width,
								screenRect.height,
							);
						}

						if (webcamVideo && layout?.webcamRect) {
							context.save();
							drawRoundedRectPath(context, layout.webcamRect, layout.webcamRect.borderRadius);
							context.clip();
							drawImageCover(
								context,
								webcamVideo,
								webcamVideo.videoWidth,
								webcamVideo.videoHeight,
								layout.webcamRect,
							);
							context.restore();
						}
					}

					const active = activeStream.current;
					if (active) {
						active.drawFrame = requestAnimationFrame(draw);
					}
				};

				const canvasStream = canvas.captureStream(TARGET_FRAME_RATE);
				const { track: audioTrack, context: audioContext } = await buildAudioTrack(
					screenStream,
					microphoneStream,
				);
				mixingContext = audioContext;
				if (audioTrack) {
					canvasStream.addTrack(audioTrack);
				}

				const recorder = new MediaRecorder(canvasStream, {
					mimeType: selectLiveMimeType(),
					videoBitsPerSecond: videoBitrateKbps * 1000,
					audioBitsPerSecond: AUDIO_BITRATE,
				});

				recorder.ondataavailable = (event) => {
					if (stopping.current) {
						return;
					}
					if (!event.data || event.data.size === 0) {
						return;
					}
					const chunk = event.data;
					chunkWriteQueue.current = chunkWriteQueue.current
						.then(async () => {
							const buffer = await chunk.arrayBuffer();
							if (stopping.current) {
								return;
							}
							const result = await window.electronAPI.writeLiveStreamChunk(buffer);
							if (!result.success && !stopping.current) {
								toast.error(result.error ?? "Live stream encoder stopped.");
								await stopLiveStream();
							}
						})
						.catch(async (error) => {
							if (!stopping.current) {
								console.warn("Live stream chunk write failed:", error);
								toast.error(error instanceof Error ? error.message : "Live stream encoder failed.");
								await stopLiveStream();
							}
						});
					void chunkWriteQueue.current;
				};
				recorder.onerror = () => {
					if (!stopping.current) {
						toast.error("Live stream recorder failed.");
						void stopLiveStream();
					}
				};

				activeStream.current = {
					recorder,
					drawFrame: requestAnimationFrame(draw),
					canvasStream,
					screenStream,
					microphoneStream,
					webcamStream,
					mixingContext,
					screenVideo,
					webcamVideo,
				};

				await new Promise((resolve) => window.setTimeout(resolve, LIVE_AUDIO_WARMUP_MS));
				recorder.start(LIVE_STREAM_TIMESLICE_MS);
				if (youtubeLiveStream) {
					void waitForYouTubeLiveStatus(youtubeLiveStream);
				} else {
					const providerStartedAt = Date.now();
					setStreamElapsedSeconds(0);
					publishProviderStatus({
						status: null,
						timerStarted: true,
						stopAllowed: true,
						startedAt: providerStartedAt,
					});
				}
				setStreaming(true);
				return true;
			} catch (error) {
				console.error("Failed to start live stream:", error);
				toast.error(error instanceof Error ? error.message : "Failed to start live stream.");
				stopStream(screenStream);
				stopStream(microphoneStream);
				stopStream(webcamStream);
				mixingContext?.close().catch(() => undefined);
				await window.electronAPI.stopLiveStream();
				startedAt.current = null;
				setProviderTimerStarted(false);
				setProviderStopAllowed(false);
				setProviderStatus(null);
				setStreaming(false);
				setStreamElapsedSeconds(0);
				return false;
			}
		},
		[
			buildAudioTrack,
			captureMicrophoneStream,
			captureScreenStream,
			captureWebcamStream,
			deviceConfig.onProviderWatchUrl,
			publishProviderStatus,
			stopLiveStream,
			streaming,
			waitForYouTubeLiveStatus,
		],
	);

	useEffect(() => {
		if (!streaming || !providerTimerStarted) {
			return;
		}

		const interval = window.setInterval(() => {
			if (startedAt.current) {
				setStreamElapsedSeconds(Math.floor((Date.now() - startedAt.current) / 1000));
			}
		}, 250);

		return () => window.clearInterval(interval);
	}, [providerTimerStarted, streaming]);

	useEffect(() => {
		return () => {
			cleanupActiveStream();
			void window.electronAPI.stopLiveStream();
		};
	}, [cleanupActiveStream]);

	return {
		streaming,
		providerTimerStarted,
		providerStopAllowed,
		providerStatus,
		streamElapsedSeconds,
		startLiveStream,
		stopLiveStream,
	};
}
