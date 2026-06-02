import { Minus, Plus, Radio, RadioTower } from "lucide-react";
import { type CSSProperties, useEffect, useMemo, useRef, useState } from "react";
import { computeCompositeLayout } from "@/lib/compositeLayout";
import type { WebcamLayoutPreset } from "@/lib/liveLayoutTypes";
import {
	LIVE_OUTPUT_PRESETS,
	type LiveOutputPresetId,
	type LiveStreamLayout,
	validateLiveStreamDestination,
} from "@/lib/liveStream";
import { cn } from "@/lib/utils";
import { Button } from "../ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "../ui/dialog";
import { Input } from "../ui/input";

type LiveStreamSetupDialogProps = {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	selectedSource: ProcessedDesktopSource | null;
	webcamEnabled: boolean;
	webcamDeviceId?: string;
	layout: LiveStreamLayout;
	onLayoutChange: (layout: LiveStreamLayout) => void;
	onStart: (input: {
		serverUrl: string;
		streamKey: string;
		layout: LiveStreamLayout;
	}) => Promise<boolean>;
};

const PREVIEW_PADDING = 16;
const DEFAULT_STREAM_SERVER_URL = "rtmp://a.rtmp.youtube.com/live2";
const START_CAPTURE_DELAY_MS = 220;
const LAYOUT_PRESETS: Array<{ id: WebcamLayoutPreset; label: string }> = [
	{ id: "picture-in-picture", label: "Picture in Picture" },
	{ id: "dual-frame", label: "Dual Frame" },
	{ id: "vertical-stack", label: "Vertical Stack" },
	{ id: "no-webcam", label: "No Webcam" },
];

function delay(ms: number): Promise<void> {
	return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function getCssClipPath(shape: LiveStreamLayout["webcamMaskShape"]) {
	if (shape === "circle") return "circle(50% at 50% 50%)";
	if (shape === "square") return "inset(0 round 8px)";
	if (shape === "rounded") return "inset(0 round 30%)";
	return undefined;
}

function formatDestinationPreview(serverUrl: string, streamKey: string) {
	const normalizedServerUrl = serverUrl.trim().replace(/\/+$/, "");
	const normalizedStreamKey = streamKey.trim();
	if (!normalizedServerUrl || !normalizedStreamKey) {
		return "rtmp(s)://...";
	}

	const visibleSuffix = normalizedStreamKey.slice(-4);
	return `${normalizedServerUrl}/****${visibleSuffix ? `-${visibleSuffix}` : ""}`;
}

export function LiveStreamSetupDialog({
	open,
	onOpenChange,
	selectedSource,
	webcamEnabled,
	webcamDeviceId,
	layout,
	onLayoutChange,
	onStart,
}: LiveStreamSetupDialogProps) {
	const [serverUrl, setServerUrl] = useState(DEFAULT_STREAM_SERVER_URL);
	const [streamKey, setStreamKey] = useState("");
	const [error, setError] = useState<string | null>(null);
	const [starting, setStarting] = useState(false);
	const [previewSize, setPreviewSize] = useState({ width: 640, height: 360 });
	const [sourceSize, setSourceSize] = useState({ width: 16, height: 9 });
	const [webcamSize, setWebcamSize] = useState<{ width: number; height: number } | null>(null);
	const previewRef = useRef<HTMLDivElement | null>(null);
	const webcamVideoRef = useRef<HTMLVideoElement | null>(null);
	const webcamDragOffsetRef = useRef({ dx: 0, dy: 0 });
	const isDraggingWebcamRef = useRef(false);

	useEffect(() => {
		if (!open) {
			setError(null);
			setStarting(false);
		}
	}, [open]);

	useEffect(() => {
		if (!selectedSource?.thumbnail) {
			setSourceSize({ width: layout.outputPreset.width, height: layout.outputPreset.height });
			return;
		}

		const image = new Image();
		image.onload = () => {
			if (image.naturalWidth > 0 && image.naturalHeight > 0) {
				setSourceSize({ width: image.naturalWidth, height: image.naturalHeight });
			}
		};
		image.src = selectedSource.thumbnail;
	}, [layout.outputPreset.height, layout.outputPreset.width, selectedSource?.thumbnail]);

	useEffect(() => {
		if (!open) return;

		const updateSize = () => {
			const container = previewRef.current;
			if (!container) return;
			const parentWidth = container.parentElement?.clientWidth ?? 640;
			const maxWidth = Math.max(260, parentWidth - PREVIEW_PADDING * 2);
			const aspect = layout.outputPreset.width / layout.outputPreset.height;
			let width = maxWidth;
			let height = width / aspect;
			const maxHeight = 430;
			if (height > maxHeight) {
				height = maxHeight;
				width = height * aspect;
			}
			setPreviewSize({ width: Math.round(width), height: Math.round(height) });
		};

		updateSize();
		window.addEventListener("resize", updateSize);
		return () => window.removeEventListener("resize", updateSize);
	}, [layout.outputPreset, open]);

	useEffect(() => {
		if (!open || !webcamEnabled) {
			setWebcamSize(null);
			return;
		}

		let cancelled = false;
		let stream: MediaStream | null = null;
		const acquire = async () => {
			try {
				stream = await navigator.mediaDevices.getUserMedia({
					audio: false,
					video: webcamDeviceId
						? {
								deviceId: { exact: webcamDeviceId },
								width: { ideal: 1280 },
								height: { ideal: 720 },
							}
						: {
								width: { ideal: 1280 },
								height: { ideal: 720 },
							},
				});
				if (cancelled) {
					stream.getTracks().forEach((track) => track.stop());
					return;
				}

				const video = webcamVideoRef.current;
				if (!video) return;
				video.srcObject = stream;
				video.onloadedmetadata = () => {
					setWebcamSize({
						width: video.videoWidth || 1280,
						height: video.videoHeight || 720,
					});
					video.play().catch((error) => {
						if (import.meta.env.DEV) {
							console.debug("Webcam preview play failed:", error);
						}
					});
				};
			} catch (error) {
				console.warn("Unable to start webcam setup preview:", error);
				setWebcamSize(null);
			}
		};

		void acquire();

		return () => {
			cancelled = true;
			stream?.getTracks().forEach((track) => track.stop());
			if (webcamVideoRef.current) {
				webcamVideoRef.current.srcObject = null;
			}
		};
	}, [open, webcamDeviceId, webcamEnabled]);

	const scaledLayout = useMemo(() => {
		const previewWebcamSize =
			webcamEnabled && layout.webcamLayoutPreset !== "no-webcam"
				? (webcamSize ?? { width: 1280, height: 720 })
				: null;
		const result = computeCompositeLayout({
			canvasSize: previewSize,
			maxContentSize: previewSize,
			screenSize: sourceSize,
			webcamSize: previewWebcamSize,
			layoutPreset: webcamEnabled ? layout.webcamLayoutPreset : "no-webcam",
			webcamMaskShape: layout.webcamMaskShape,
			webcamSizePreset: layout.webcamSizePreset,
			webcamPosition: layout.webcamPosition,
		});

		return result;
	}, [layout, previewSize, sourceSize, webcamEnabled, webcamSize]);

	const updateLayout = (next: Partial<LiveStreamLayout>) => {
		onLayoutChange({ ...layout, ...next });
	};

	const updateWebcamSizePreset = (webcamSizePreset: number) => {
		updateLayout({
			webcamSizePreset: Math.max(10, Math.min(50, Math.round(webcamSizePreset))),
		});
	};

	const handleStart = async () => {
		const validationError = validateLiveStreamDestination({ serverUrl, streamKey });
		if (validationError) {
			setError(validationError);
			return;
		}

		setError(null);
		setStarting(true);
		onOpenChange(false);
		await delay(START_CAPTURE_DELAY_MS);
		const started = await onStart({ serverUrl, streamKey, layout });
		if (!started) {
			onOpenChange(true);
		}
		setStarting(false);
	};

	const handleWebcamPointerDown = (event: React.PointerEvent<HTMLVideoElement>) => {
		if (layout.webcamLayoutPreset !== "picture-in-picture") return;
		event.preventDefault();
		event.stopPropagation();
		isDraggingWebcamRef.current = true;
		event.currentTarget.setPointerCapture(event.pointerId);
		const rect = event.currentTarget.getBoundingClientRect();
		webcamDragOffsetRef.current = {
			dx: event.clientX - (rect.left + rect.width / 2),
			dy: event.clientY - (rect.top + rect.height / 2),
		};
	};

	const handleWebcamPointerMove = (event: React.PointerEvent<HTMLVideoElement>) => {
		if (!isDraggingWebcamRef.current) return;
		const container = previewRef.current;
		if (!container) return;
		event.preventDefault();
		event.stopPropagation();
		const rect = container.getBoundingClientRect();
		const cx = Math.max(
			0,
			Math.min(1, (event.clientX - webcamDragOffsetRef.current.dx - rect.left) / rect.width),
		);
		const cy = Math.max(
			0,
			Math.min(1, (event.clientY - webcamDragOffsetRef.current.dy - rect.top) / rect.height),
		);
		updateLayout({ webcamPosition: { cx, cy } });
	};

	const handleWebcamPointerUp = (event: React.PointerEvent<HTMLVideoElement>) => {
		if (!isDraggingWebcamRef.current) return;
		isDraggingWebcamRef.current = false;
		if (event.currentTarget.hasPointerCapture(event.pointerId)) {
			event.currentTarget.releasePointerCapture(event.pointerId);
		}
	};

	const sourceRect = scaledLayout?.screenRect ?? {
		x: 0,
		y: 0,
		width: previewSize.width,
		height: previewSize.height,
	};
	const webcamRect = scaledLayout?.webcamRect ?? null;
	const clipPath = getCssClipPath(layout.webcamMaskShape);
	const destinationPreview = formatDestinationPreview(serverUrl, streamKey);

	return (
		<Dialog open={open} onOpenChange={(nextOpen) => !starting && onOpenChange(nextOpen)}>
			<DialogContent
				data-hud-interactive="true"
				className="flex h-[calc(100vh-24px)] w-[calc(100vw-24px)] max-w-[960px] grid-rows-none flex-col gap-0 overflow-hidden border-white/10 bg-[#0b0c10] p-0 text-white"
				style={{ WebkitAppRegion: "no-drag" } as CSSProperties}
				onPointerMove={(event) => event.stopPropagation()}
				onPointerDown={(event) => event.stopPropagation()}
			>
				<DialogHeader className="shrink-0 border-b border-white/10 px-5 py-3">
					<div className="flex items-center gap-2">
						<div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500/15 text-emerald-300">
							<RadioTower size={17} />
						</div>
						<div>
							<DialogTitle className="text-base">Stream Setup</DialogTitle>
							<DialogDescription className="text-xs text-white/50">
								Arrange the live output before going live.
							</DialogDescription>
						</div>
					</div>
				</DialogHeader>

				<div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_260px] gap-4 overflow-hidden p-4">
					<div className="min-w-0 space-y-3">
						<div className="mb-3 flex flex-wrap items-center gap-2">
							{LIVE_OUTPUT_PRESETS.map((preset) => (
								<button
									key={preset.id}
									type="button"
									onClick={() =>
										updateLayout({
											outputPreset: LIVE_OUTPUT_PRESETS.find(
												(item) => item.id === (preset.id as LiveOutputPresetId),
											)!,
											webcamPosition: null,
										})
									}
									className={cn(
										"h-8 rounded-lg border px-3 text-[11px] font-semibold transition-colors",
										layout.outputPreset.id === preset.id
											? "border-emerald-400 bg-emerald-500/15 text-emerald-200"
											: "border-white/10 bg-white/[0.04] text-white/60 hover:bg-white/[0.08]",
									)}
								>
									{preset.label}
								</button>
							))}
						</div>

						<div className="flex min-h-0 justify-center rounded-xl border border-white/10 bg-black/35 p-4">
							<div
								ref={previewRef}
								className="relative overflow-hidden rounded-lg bg-[#050609] shadow-[0_18px_60px_rgba(0,0,0,0.45)]"
								style={{ width: previewSize.width, height: previewSize.height }}
							>
								{selectedSource?.thumbnail ? (
									<img
										src={selectedSource.thumbnail}
										alt={selectedSource.name}
										className="absolute object-cover"
										style={{
											left: sourceRect.x,
											top: sourceRect.y,
											width: sourceRect.width,
											height: sourceRect.height,
										}}
									/>
								) : (
									<div
										className="absolute flex items-center justify-center bg-white/[0.04] text-xs text-white/35"
										style={{
											left: sourceRect.x,
											top: sourceRect.y,
											width: sourceRect.width,
											height: sourceRect.height,
										}}
									>
										{selectedSource?.name ?? "Selected source"}
									</div>
								)}

								{webcamEnabled && webcamRect && (
									<video
										ref={webcamVideoRef}
										muted
										playsInline
										className={cn(
											"absolute z-10 h-full w-full object-cover bg-black",
											layout.webcamLayoutPreset === "picture-in-picture" &&
												"cursor-grab active:cursor-grabbing",
										)}
										style={{
											left: webcamRect.x,
											top: webcamRect.y,
											width: webcamRect.width,
											height: webcamRect.height,
											borderRadius: clipPath ? 0 : webcamRect.borderRadius,
											clipPath,
											boxShadow: "0 10px 26px rgba(0,0,0,0.35)",
										}}
										onPointerDown={handleWebcamPointerDown}
										onPointerMove={handleWebcamPointerMove}
										onPointerUp={handleWebcamPointerUp}
										onPointerCancel={handleWebcamPointerUp}
									/>
								)}
								<div className="pointer-events-none absolute inset-0 z-30 rounded-lg border border-emerald-300/55 shadow-[inset_0_0_0_1px_rgba(16,185,129,0.18)]" />
							</div>
						</div>
					</div>

					<div className="min-w-0 space-y-3 overflow-y-auto pr-1">
						<div className="space-y-1.5">
							<label className="text-[11px] font-medium text-white/70" htmlFor="rtmps-server-url">
								Server URL
							</label>
							<Input
								id="rtmps-server-url"
								value={serverUrl}
								onChange={(event) => setServerUrl(event.target.value)}
								placeholder="rtmp://a.rtmp.youtube.com/live2"
								className="h-9 border-white/10 bg-white/[0.04] text-xs text-white placeholder:text-white/25"
							/>
						</div>
						<div className="space-y-1.5">
							<label className="text-[11px] font-medium text-white/70" htmlFor="rtmps-stream-key">
								Stream key
							</label>
							<Input
								id="rtmps-stream-key"
								value={streamKey}
								onChange={(event) => setStreamKey(event.target.value)}
								type="password"
								placeholder="Stream key"
								className="h-9 border-white/10 bg-white/[0.04] text-xs text-white placeholder:text-white/25"
							/>
						</div>
						<div className="truncate rounded-lg border border-white/10 bg-white/[0.03] px-2.5 py-2 text-[10px] text-white/35">
							{destinationPreview}
						</div>

						{webcamEnabled && (
							<>
								<div className="space-y-1.5">
									<div className="text-[11px] font-medium text-white/70">Layout</div>
									<div className="grid grid-cols-2 gap-1.5">
										{LAYOUT_PRESETS.map((preset) => (
											<button
												key={preset.id}
												type="button"
												onClick={() =>
													updateLayout({
														webcamLayoutPreset: preset.id,
														webcamPosition: null,
													})
												}
												className={cn(
													"h-8 rounded-lg border px-2 text-[10px] font-semibold transition-colors",
													layout.webcamLayoutPreset === preset.id
														? "border-emerald-400 bg-emerald-500/15 text-emerald-200"
														: "border-white/10 bg-white/[0.04] text-white/55 hover:bg-white/[0.08]",
												)}
											>
												{preset.label}
											</button>
										))}
									</div>
								</div>

								<div className="grid grid-cols-2 gap-1.5">
									{(["rectangle", "rounded", "circle", "square"] as const).map((shape) => (
										<button
											key={shape}
											type="button"
											disabled={layout.webcamLayoutPreset !== "picture-in-picture"}
											onClick={() => updateLayout({ webcamMaskShape: shape })}
											className={cn(
												"h-8 rounded-lg border text-[10px] font-semibold capitalize transition-colors disabled:opacity-35",
												layout.webcamMaskShape === shape
													? "border-emerald-400 bg-emerald-500/15 text-emerald-200"
													: "border-white/10 bg-white/[0.04] text-white/55 hover:bg-white/[0.08]",
											)}
										>
											{shape}
										</button>
									))}
								</div>

								<div className="space-y-1.5">
									<div className="flex items-center justify-between">
										<label
											className="text-[11px] font-medium text-white/70"
											htmlFor="live-webcam-size"
										>
											Webcam size
										</label>
										<span className="text-[10px] text-white/45">{layout.webcamSizePreset}%</span>
									</div>
									<div className="grid grid-cols-[32px_minmax(0,1fr)_32px] items-center gap-2">
										<button
											type="button"
											aria-label="Decrease webcam size"
											disabled={layout.webcamLayoutPreset !== "picture-in-picture"}
											onClick={() => updateWebcamSizePreset(layout.webcamSizePreset - 5)}
											className="flex h-8 items-center justify-center rounded-lg border border-white/10 bg-white/[0.04] text-white/70 transition-colors hover:bg-white/[0.08] disabled:opacity-35"
										>
											<Minus size={13} />
										</button>
										<input
											id="live-webcam-size"
											type="range"
											min={10}
											max={50}
											step={1}
											value={layout.webcamSizePreset}
											disabled={layout.webcamLayoutPreset !== "picture-in-picture"}
											onChange={(event) => updateWebcamSizePreset(Number(event.target.value))}
											className="w-full accent-emerald-400 disabled:opacity-35"
										/>
										<button
											type="button"
											aria-label="Increase webcam size"
											disabled={layout.webcamLayoutPreset !== "picture-in-picture"}
											onClick={() => updateWebcamSizePreset(layout.webcamSizePreset + 5)}
											className="flex h-8 items-center justify-center rounded-lg border border-white/10 bg-white/[0.04] text-white/70 transition-colors hover:bg-white/[0.08] disabled:opacity-35"
										>
											<Plus size={13} />
										</button>
									</div>
								</div>
							</>
						)}

						{error && (
							<div className="rounded-lg border border-red-500/25 bg-red-500/10 px-2.5 py-2 text-[11px] text-red-200">
								{error}
							</div>
						)}
					</div>
				</div>

				<DialogFooter className="shrink-0 border-t border-white/10 px-5 py-3">
					<Button
						type="button"
						variant="ghost"
						disabled={starting}
						onClick={() => onOpenChange(false)}
						className="h-8 text-xs text-white/65 hover:bg-white/10 hover:text-white"
					>
						Cancel
					</Button>
					<Button
						type="button"
						disabled={starting || !selectedSource}
						onClick={handleStart}
						className="h-8 gap-2 bg-emerald-500 px-4 text-xs font-semibold text-white hover:bg-emerald-500/85"
					>
						<Radio size={14} />
						{starting ? "Starting..." : "Go Live"}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
