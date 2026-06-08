import { useEffect, useMemo, useRef, useState } from "react";
import { computeCompositeLayout } from "@/lib/compositeLayout";
import type { WebcamMaskShape } from "@/lib/liveLayoutTypes";
import styles from "./LaunchWindow.module.css";

function getCssClipPath(shape: WebcamMaskShape) {
	if (shape === "circle") return "circle(50% at 50% 50%)";
	if (shape === "square") return "inset(0 round 8px)";
	if (shape === "rounded") return "inset(0 round 30%)";
	return undefined;
}

function isPointInsideRect(
	point: { x: number; y: number },
	rect: { x: number; y: number; width: number; height: number },
) {
	return (
		point.x >= rect.x &&
		point.x <= rect.x + rect.width &&
		point.y >= rect.y &&
		point.y <= rect.y + rect.height
	);
}

export function WebcamPreviewWindow() {
	const [previewState, setPreviewState] = useState<WebcamPreviewState | null>(null);
	const [webcamSize, setWebcamSize] = useState<{ width: number; height: number } | null>(null);
	const [overlaySize, setOverlaySize] = useState({
		width: window.innerWidth,
		height: window.innerHeight,
	});
	const videoRef = useRef<HTMLVideoElement | null>(null);
	const dragOffsetRef = useRef({ dx: 0, dy: 0 });
	const isDraggingRef = useRef(false);
	const mouseEventsEnabledRef = useRef(false);

	useEffect(() => {
		const unsubscribe = window.electronAPI.onWebcamPreviewStateChanged((state) => {
			setPreviewState(state);
		});
		return unsubscribe;
	}, []);

	useEffect(() => {
		const updateSize = () => {
			setOverlaySize({ width: window.innerWidth, height: window.innerHeight });
		};
		updateSize();
		window.addEventListener("resize", updateSize);
		return () => window.removeEventListener("resize", updateSize);
	}, []);

	useEffect(() => {
		if (!previewState?.enabled) {
			setWebcamSize(null);
			return;
		}

		let cancelled = false;
		let stream: MediaStream | null = null;
		const startPreview = async () => {
			try {
				stream = await navigator.mediaDevices.getUserMedia({
					audio: false,
					video: previewState.webcamDeviceId
						? {
								deviceId: { exact: previewState.webcamDeviceId },
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

				const video = videoRef.current;
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
				console.warn("Unable to start webcam overlay preview:", error);
				setWebcamSize(null);
			}
		};

		void startPreview();

		return () => {
			cancelled = true;
			stream?.getTracks().forEach((track) => track.stop());
			if (videoRef.current) {
				videoRef.current.srcObject = null;
			}
		};
	}, [previewState?.enabled, previewState?.webcamDeviceId]);

	const layout = useMemo(() => {
		if (!previewState?.enabled) return null;
		return computeCompositeLayout({
			canvasSize: overlaySize,
			maxContentSize: overlaySize,
			screenSize: overlaySize,
			webcamSize: webcamSize ?? { width: 1280, height: 720 },
			layoutPreset: "picture-in-picture",
			webcamMaskShape: previewState.layout.webcamMaskShape,
			webcamSizePreset: previewState.layout.webcamSizePreset,
			webcamPosition: previewState.layout.webcamPosition,
		});
	}, [overlaySize, previewState, webcamSize]);
	const webcamRect = layout?.webcamRect ?? null;
	const clipPath = previewState ? getCssClipPath(previewState.layout.webcamMaskShape) : undefined;

	const setMouseEventsEnabled = (enabled: boolean) => {
		if (mouseEventsEnabledRef.current === enabled) return;
		mouseEventsEnabledRef.current = enabled;
		window.electronAPI.setWebcamPreviewPointerMode(enabled ? "interactive" : "passthrough");
	};

	const handleMouseMove = (event: React.MouseEvent<HTMLDivElement>) => {
		if (!webcamRect || isDraggingRef.current) return;
		setMouseEventsEnabled(isPointInsideRect({ x: event.clientX, y: event.clientY }, webcamRect));
	};

	const handlePointerDown = (event: React.PointerEvent<HTMLVideoElement>) => {
		if (!webcamRect) return;
		event.preventDefault();
		event.stopPropagation();
		setMouseEventsEnabled(true);
		isDraggingRef.current = true;
		event.currentTarget.setPointerCapture(event.pointerId);
		const rect = event.currentTarget.getBoundingClientRect();
		dragOffsetRef.current = {
			dx: event.clientX - (rect.left + rect.width / 2),
			dy: event.clientY - (rect.top + rect.height / 2),
		};
	};

	const handlePointerMove = (event: React.PointerEvent<HTMLVideoElement>) => {
		if (!isDraggingRef.current) return;
		event.preventDefault();
		event.stopPropagation();
		const cx = Math.max(
			0,
			Math.min(1, (event.clientX - dragOffsetRef.current.dx) / window.innerWidth),
		);
		const cy = Math.max(
			0,
			Math.min(1, (event.clientY - dragOffsetRef.current.dy) / window.innerHeight),
		);
		window.electronAPI.sendWebcamPreviewPosition({ cx, cy });
	};

	const handlePointerUp = (event: React.PointerEvent<HTMLVideoElement>) => {
		if (!isDraggingRef.current) return;
		isDraggingRef.current = false;
		if (event.currentTarget.hasPointerCapture(event.pointerId)) {
			event.currentTarget.releasePointerCapture(event.pointerId);
		}
		setMouseEventsEnabled(false);
	};

	return (
		<div
			className="relative h-full w-full overflow-hidden bg-transparent"
			onMouseMove={handleMouseMove}
			onMouseLeave={() => setMouseEventsEnabled(false)}
		>
			{previewState?.enabled && webcamRect && (
				<video
					ref={videoRef}
					muted
					playsInline
					className={`absolute z-10 bg-black object-cover shadow-[0_10px_26px_rgba(0,0,0,0.35)] cursor-grab active:cursor-grabbing ${styles.electronNoDrag}`}
					style={{
						left: webcamRect.x,
						top: webcamRect.y,
						width: webcamRect.width,
						height: webcamRect.height,
						borderRadius: clipPath ? 0 : webcamRect.borderRadius,
						clipPath,
					}}
					onPointerDown={handlePointerDown}
					onPointerMove={handlePointerMove}
					onPointerUp={handlePointerUp}
					onPointerCancel={handlePointerUp}
				/>
			)}
		</div>
	);
}
