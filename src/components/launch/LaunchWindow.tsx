import { Check, ChevronDown, Columns3, Languages, RadioTower, Rows3 } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { FiMinus, FiX } from "react-icons/fi";
import {
	MdMic,
	MdMicOff,
	MdMonitor,
	MdVideocam,
	MdVideocamOff,
	MdVolumeOff,
	MdVolumeUp,
} from "react-icons/md";
import { RxDragHandleDots2 } from "react-icons/rx";
import { useI18n, useScopedT } from "@/contexts/I18nContext";
import { getAvailableLocales, getLocaleName } from "@/i18n/loader";
import { useAudioLevelMeter } from "../../hooks/useAudioLevelMeter";
import { useCameraDevices } from "../../hooks/useCameraDevices";
import { useLiveStreamer } from "../../hooks/useLiveStreamer";
import { useMicrophoneDevices } from "../../hooks/useMicrophoneDevices";
import type { WebcamMaskShape } from "../../lib/liveLayoutTypes";
import {
	DEFAULT_LIVE_STREAM_LAYOUT,
	type LiveStreamLayout,
	type LiveStreamStartConfig,
} from "../../lib/liveStream";
import { requestCameraAccess } from "../../lib/requestCameraAccess";
import { loadUserPreferences, saveUserPreferences } from "../../lib/userPreferences";
import { formatTimePadded } from "../../utils/timeUtils";
import { AudioLevelMeter } from "../ui/audio-level-meter";
import { Button } from "../ui/button";
import { Tooltip } from "../ui/tooltip";
import styles from "./LaunchWindow.module.css";
import { LiveStreamSetupDialog } from "./LiveStreamSetupDialog";

const ICON_SIZE = 20;

const hudGroupClasses =
	"flex items-center gap-0.5 rounded-xl border border-white/[0.07] bg-white/[0.045] transition-colors duration-150 hover:bg-white/[0.075]";

const hudIconBtnClasses =
	"flex h-8 w-8 items-center justify-center rounded-lg transition-all duration-150 cursor-pointer text-white hover:bg-white/10 active:scale-95 disabled:cursor-not-allowed disabled:opacity-35";

const windowBtnClasses =
	"flex h-8 w-8 items-center justify-center rounded-lg transition-all duration-150 cursor-pointer opacity-50 hover:opacity-90 hover:bg-white/[0.08]";

const hudSidebarClasses = "ml-0.5 pl-1.5 border-l border-white/10 flex items-center gap-0.5";
const hudSidebarVerticalClasses =
	"mt-0.5 pt-1.5 border-t border-white/10 flex flex-col items-center gap-0.5";
const WEBCAM_SHAPE_OPTIONS: Array<{ value: WebcamMaskShape; label: string }> = [
	{ value: "rectangle", label: "Rectangle" },
	{ value: "rounded", label: "Rounded" },
	{ value: "circle", label: "Circle" },
	{ value: "square", label: "Square" },
];
const WEBCAM_SIZE_OPTIONS = [
	{ value: 15, label: "Small" },
	{ value: 25, label: "Medium" },
	{ value: 35, label: "Large" },
	{ value: 50, label: "XL" },
];

export function LaunchWindow() {
	const t = useScopedT("launch");
	const availableLocales = getAvailableLocales();
	const {
		locale,
		setLocale,
		systemLocaleSuggestion,
		acceptSystemLocaleSuggestion,
		dismissSystemLocaleSuggestion,
		resolveSystemLocaleSuggestion,
	} = useI18n();
	const suggestedLanguageName = systemLocaleSuggestion ? getLocaleName(systemLocaleSuggestion) : "";
	const activeLanguageLabel = getLocaleName(locale).split(/\s+/)[0] || locale.toUpperCase();

	const [systemAudioEnabled, setSystemAudioEnabled] = useState(false);
	const [microphoneEnabled, setMicrophoneEnabled] = useState(false);
	const [microphoneDeviceId, setMicrophoneDeviceId] = useState<string | undefined>(undefined);
	const [webcamEnabled, setWebcamEnabledState] = useState(false);
	const [webcamDeviceId, setWebcamDeviceId] = useState<string | undefined>(undefined);
	const { streaming, streamElapsedSeconds, startLiveStream, stopLiveStream } = useLiveStreamer({
		systemAudioEnabled,
		microphoneEnabled,
		microphoneDeviceId,
		webcamEnabled,
		webcamDeviceId,
	});

	const showMicControls = microphoneEnabled && !streaming;
	const showWebcamControls = webcamEnabled && !streaming;
	const [isMicHovered, setIsMicHovered] = useState(false);
	const [isMicFocused, setIsMicFocused] = useState(false);
	const micExpanded = isMicHovered || isMicFocused;
	const [isWebcamHovered, setIsWebcamHovered] = useState(false);
	const [isWebcamFocused, setIsWebcamFocused] = useState(false);
	const webcamExpanded = isWebcamHovered || isWebcamFocused;
	const [isLanguageMenuOpen, setIsLanguageMenuOpen] = useState(false);
	const [trayLayout, setTrayLayout] = useState<"horizontal" | "vertical">(
		() => loadUserPreferences().trayLayout,
	);
	const languageTriggerRef = useRef<HTMLButtonElement | null>(null);
	const languageMenuPanelRef = useRef<HTMLDivElement | null>(null);
	const [languageMenuStyle, setLanguageMenuStyle] = useState({
		right: 12,
		top: 12,
		maxHeight: 240,
	});

	const {
		devices: micDevices,
		selectedDeviceId: selectedMicId,
		setSelectedDeviceId: setSelectedMicId,
	} = useMicrophoneDevices(microphoneEnabled);
	const {
		devices: cameraDevices,
		selectedDeviceId: selectedCameraId,
		setSelectedDeviceId: setSelectedCameraId,
		isLoading: isCameraDevicesLoading,
		error: cameraDevicesError,
	} = useCameraDevices(webcamEnabled);

	const selectedMicLabel =
		micDevices.find((d) => d.deviceId === (microphoneDeviceId || selectedMicId))?.label ||
		t("audio.defaultMicrophone");
	const selectedCameraDevice = cameraDevices.find(
		(d) => d.deviceId === (webcamDeviceId || selectedCameraId),
	);
	const selectedCameraLabel = isCameraDevicesLoading
		? t("webcam.searching")
		: cameraDevicesError
			? t("webcam.unavailable")
			: cameraDevices.length === 0
				? t("webcam.noneFound")
				: selectedCameraDevice?.label || t("webcam.defaultCamera");
	const { level } = useAudioLevelMeter({
		enabled: showMicControls,
		deviceId: microphoneDeviceId,
	});

	useEffect(() => {
		if (selectedMicId && selectedMicId !== "default") {
			setMicrophoneDeviceId(selectedMicId);
		}
	}, [selectedMicId]);

	useEffect(() => {
		if (selectedCameraId) {
			setWebcamDeviceId(selectedCameraId);
		}
	}, [selectedCameraId]);

	useEffect(() => {
		if (!import.meta.env.DEV) return;
		void requestCameraAccess().catch((error) => {
			console.warn("Failed to trigger camera access request during development:", error);
		});
	}, []);

	useEffect(() => {
		if (!isLanguageMenuOpen) return;
		const handlePointerDown = (event: PointerEvent) => {
			const target = event.target as Node;
			if (
				!languageTriggerRef.current?.contains(target) &&
				!languageMenuPanelRef.current?.contains(target)
			) {
				setIsLanguageMenuOpen(false);
			}
		};
		const handleEscape = (event: KeyboardEvent) => {
			if (event.key === "Escape") setIsLanguageMenuOpen(false);
		};
		window.addEventListener("pointerdown", handlePointerDown);
		window.addEventListener("keydown", handleEscape);
		return () => {
			window.removeEventListener("pointerdown", handlePointerDown);
			window.removeEventListener("keydown", handleEscape);
		};
	}, [isLanguageMenuOpen]);

	useEffect(() => {
		if (!isLanguageMenuOpen || !languageTriggerRef.current) return;
		const updatePosition = () => {
			if (!languageTriggerRef.current) return;
			const rect = languageTriggerRef.current.getBoundingClientRect();
			const gap = 8;
			const viewportPadding = 8;
			const availableHeight = Math.max(80, rect.top - viewportPadding - gap);
			setLanguageMenuStyle({
				right: Math.max(viewportPadding, window.innerWidth - rect.right),
				top: Math.max(viewportPadding, rect.top - gap - availableHeight),
				maxHeight: availableHeight,
			});
		};
		updatePosition();
		window.addEventListener("resize", updatePosition);
		window.addEventListener("scroll", updatePosition, true);
		return () => {
			window.removeEventListener("resize", updatePosition);
			window.removeEventListener("scroll", updatePosition, true);
		};
	}, [isLanguageMenuOpen]);

	const hudMouseEventsEnabledRef = useRef<boolean | undefined>(undefined);
	const setHudMouseEventsEnabled = useCallback((enabled: boolean) => {
		if (hudMouseEventsEnabledRef.current === enabled) return;
		hudMouseEventsEnabledRef.current = enabled;
		window.electronAPI?.setHudOverlayIgnoreMouseEvents?.(!enabled);
	}, []);

	useEffect(() => {
		setHudMouseEventsEnabled(false);
		return () => window.electronAPI?.setHudOverlayIgnoreMouseEvents?.(false);
	}, [setHudMouseEventsEnabled]);

	const [selectedSource, setSelectedSource] = useState<ProcessedDesktopSource | null>(null);
	const [screenSources, setScreenSources] = useState<ProcessedDesktopSource[]>([]);
	const [screenSourcesLoading, setScreenSourcesLoading] = useState(true);
	const [liveSetupOpen, setLiveSetupOpen] = useState(false);
	const [liveSetupPreparing, setLiveSetupPreparing] = useState(false);
	const [liveStreamLayout, setLiveStreamLayout] = useState<LiveStreamLayout>(
		DEFAULT_LIVE_STREAM_LAYOUT,
	);
	const [previewHiddenForStreaming, setPreviewHiddenForStreaming] = useState(false);
	const selectedSourceLabel = selectedSource?.name ?? "No screen";
	const webcamPreviewVisible =
		webcamEnabled && Boolean(selectedSource) && !streaming && !previewHiddenForStreaming;

	useEffect(() => {
		window.electronAPI?.setHudOverlayExpanded?.(liveSetupOpen);
		setHudMouseEventsEnabled(liveSetupOpen || isLanguageMenuOpen);
	}, [isLanguageMenuOpen, liveSetupOpen, setHudMouseEventsEnabled]);

	useEffect(() => {
		return () => {
			window.electronAPI?.setHudOverlayExpanded?.(false);
			window.electronAPI?.setWebcamPreviewState?.(null);
		};
	}, []);

	useEffect(() => {
		if (!streaming) {
			setPreviewHiddenForStreaming(false);
		}
	}, [streaming]);

	useEffect(() => {
		window.electronAPI?.setWebcamPreviewState?.(
			webcamPreviewVisible && selectedSource
				? {
						enabled: true,
						source: {
							id: selectedSource.id,
							display_id: selectedSource.display_id,
						},
						webcamDeviceId,
						layout: {
							webcamMaskShape: liveStreamLayout.webcamMaskShape,
							webcamSizePreset: liveStreamLayout.webcamSizePreset,
							webcamPosition: liveStreamLayout.webcamPosition,
						},
					}
				: null,
		);
	}, [liveStreamLayout, selectedSource, webcamDeviceId, webcamPreviewVisible]);

	useEffect(() => {
		return window.electronAPI?.onWebcamPreviewStateChanged?.((state) => {
			const nextPosition = state?.layout.webcamPosition;
			if (!nextPosition) return;
			setLiveStreamLayout((current) => {
				if (
					current.webcamPosition?.cx === nextPosition.cx &&
					current.webcamPosition?.cy === nextPosition.cy
				) {
					return current;
				}
				return { ...current, webcamPosition: nextPosition };
			});
		});
	}, []);

	const loadScreenSources = useCallback(async (options: { showLoading?: boolean } = {}) => {
		const showLoading = options.showLoading ?? true;
		if (showLoading) {
			setScreenSourcesLoading(true);
		}
		try {
			const access = await window.electronAPI.requestScreenAccess();
			if (!access.granted) {
				setScreenSources([]);
				setSelectedSource(null);
				return;
			}

			const sources = await window.electronAPI.getScreenSources();
			const selected = await window.electronAPI.getSelectedSource();
			setScreenSources(sources);
			setSelectedSource(selected ?? sources[0] ?? null);
		} catch (error) {
			console.warn("Unable to load screen sources:", error);
			setScreenSources([]);
			setSelectedSource(null);
		} finally {
			if (showLoading) {
				setScreenSourcesLoading(false);
			}
		}
	}, []);

	useEffect(() => {
		void loadScreenSources({ showLoading: true });
		const interval = window.setInterval(() => void loadScreenSources({ showLoading: false }), 2500);
		return () => window.clearInterval(interval);
	}, [loadScreenSources]);

	const selectScreenSource = async (sourceId: string) => {
		const source = screenSources.find((candidate) => candidate.id === sourceId);
		if (!source) return;
		const selected = await window.electronAPI.selectSource(source);
		setSelectedSource(selected ?? source);
	};

	const setWebcamEnabled = async (enabled: boolean) => {
		if (!enabled) {
			setWebcamEnabledState(false);
			return;
		}
		const access = await requestCameraAccess();
		if (access.success && access.granted) {
			setWebcamEnabledState(true);
		}
	};

	const updateLiveStreamLayout = (next: Partial<LiveStreamLayout>) => {
		setLiveStreamLayout((current) => ({ ...current, ...next }));
	};

	const handleStartLiveStream = async (config: LiveStreamStartConfig) => {
		setPreviewHiddenForStreaming(true);
		await new Promise((resolve) => window.setTimeout(resolve, 120));
		try {
			const started = await startLiveStream(config);
			if (!started) {
				setPreviewHiddenForStreaming(false);
			}
			return started;
		} catch (error) {
			console.warn("Failed to start live stream:", error);
			setPreviewHiddenForStreaming(false);
			return false;
		}
	};

	const openLiveStreamSetup = async () => {
		if (streaming) {
			void stopLiveStream();
			return;
		}
		if (!selectedSource || liveSetupPreparing) return;
		setLiveSetupPreparing(true);
		try {
			const refreshedSource = await window.electronAPI?.captureSelectedSourcePreview?.();
			if (refreshedSource) setSelectedSource(refreshedSource);
		} catch (error) {
			console.warn("Unable to refresh live stream preview source:", error);
		} finally {
			setLiveSetupPreparing(false);
			setLiveSetupOpen(true);
		}
	};

	const toggleTrayLayout = () => {
		const nextLayout = trayLayout === "horizontal" ? "vertical" : "horizontal";
		setTrayLayout(nextLayout);
		saveUserPreferences({ trayLayout: nextLayout });
	};

	const dragLastPositionRef = useRef<{ x: number; y: number } | null>(null);
	const handleHudDragPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
		event.preventDefault();
		event.stopPropagation();
		setHudMouseEventsEnabled(true);
		event.currentTarget.setPointerCapture(event.pointerId);
		dragLastPositionRef.current = { x: event.screenX, y: event.screenY };
	};
	const handleHudDragPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
		const lastPosition = dragLastPositionRef.current;
		if (!lastPosition) return;
		const deltaX = event.screenX - lastPosition.x;
		const deltaY = event.screenY - lastPosition.y;
		window.electronAPI?.moveHudOverlayBy?.(deltaX, deltaY);
		dragLastPositionRef.current = { x: event.screenX, y: event.screenY };
	};
	const handleHudDragPointerEnd = (event: React.PointerEvent<HTMLDivElement>) => {
		dragLastPositionRef.current = null;
		if (event.currentTarget.hasPointerCapture(event.pointerId)) {
			event.currentTarget.releasePointerCapture(event.pointerId);
		}
		setHudMouseEventsEnabled(false);
	};

	return (
		<div
			className={`h-full w-full min-w-0 max-w-full overflow-hidden bg-transparent ${styles.electronDrag}`}
			onPointerMove={(event) => {
				if (liveSetupOpen) {
					setHudMouseEventsEnabled(true);
					return;
				}
				const target = event.target as HTMLElement | null;
				setHudMouseEventsEnabled(
					isLanguageMenuOpen || Boolean(target?.closest("[data-hud-interactive='true']")),
				);
			}}
			onPointerLeave={() => {
				if (!isLanguageMenuOpen && !liveSetupOpen) setHudMouseEventsEnabled(false);
			}}
		>
			{systemLocaleSuggestion && (
				<div
					data-hud-interactive="true"
					className={`fixed top-8 left-1/2 z-30 w-[calc(100vw-1rem)] max-w-[520px] -translate-x-1/2 rounded-xl border border-white/15 bg-[rgba(20,20,28,0.95)] p-3 shadow-2xl backdrop-blur-xl text-white ${styles.electronNoDrag}`}
				>
					<div className="text-[13px] font-semibold text-white">
						{t("systemLanguagePrompt.title")}
					</div>
					<div className="mt-1 text-[11px] leading-relaxed text-white/75">
						{t("systemLanguagePrompt.description", { language: suggestedLanguageName })}
					</div>
					<div className="mt-3 flex items-center justify-end gap-2">
						<Button
							type="button"
							variant="ghost"
							size="sm"
							onClick={dismissSystemLocaleSuggestion}
							className="h-7 text-xs text-white/80 hover:bg-white/10 hover:text-white"
						>
							{t("systemLanguagePrompt.keepDefault")}
						</Button>
						<Button
							type="button"
							size="sm"
							onClick={acceptSystemLocaleSuggestion}
							className="h-7 bg-white text-xs text-[#10121b] hover:bg-white/90"
						>
							{t("systemLanguagePrompt.switch", { language: suggestedLanguageName })}
						</Button>
					</div>
				</div>
			)}

			{(showMicControls || showWebcamControls) && (
				<div
					data-hud-interactive="true"
					className={`fixed bottom-[68px] left-1/2 -translate-x-1/2 flex items-center gap-2 ${styles.electronNoDrag}`}
				>
					{showMicControls && (
						<div
							className={`flex h-9 items-center gap-2 overflow-hidden rounded-xl border border-white/[0.08] bg-[#0b0c10]/90 px-3 py-1.5 shadow-[0_18px_42px_rgba(0,0,0,0.4)] backdrop-blur-2xl transition-all duration-300 ${!micExpanded ? "opacity-60 grayscale-[0.5]" : "opacity-100"}`}
							onMouseEnter={() => setIsMicHovered(true)}
							onMouseLeave={() => setIsMicHovered(false)}
							onFocus={() => setIsMicFocused(true)}
							onBlur={() => setIsMicFocused(false)}
							style={{ width: micExpanded ? "240px" : "140px" }}
						>
							<div className="relative flex-1 min-w-0">
								{!micExpanded && (
									<div className="truncate text-[10px] font-medium text-white/60">
										{selectedMicLabel}
									</div>
								)}
								<select
									value={microphoneDeviceId || selectedMicId}
									onChange={(e) => {
										setSelectedMicId(e.target.value);
										setMicrophoneDeviceId(e.target.value);
									}}
									className={`w-full appearance-none rounded-lg border border-white/10 bg-white/5 py-1 pl-2 pr-6 text-[11px] text-white outline-none hover:bg-white/10 ${!micExpanded ? "sr-only" : ""}`}
								>
									{micDevices.map((device) => (
										<option key={device.deviceId} value={device.deviceId} className="bg-[#1c1c24]">
											{device.label}
										</option>
									))}
								</select>
								{micExpanded && (
									<ChevronDown
										size={12}
										className="pointer-events-none absolute right-1.5 top-1/2 -translate-y-1/2 text-white/40"
									/>
								)}
							</div>
							<AudioLevelMeter level={level} className={`${micExpanded ? "w-16" : "w-8"} h-2`} />
						</div>
					)}
					{showWebcamControls && (
						<div
							className={`flex h-9 items-center gap-2 overflow-hidden rounded-xl border border-white/[0.08] bg-[#0b0c10]/90 px-3 py-1.5 shadow-[0_18px_42px_rgba(0,0,0,0.4)] backdrop-blur-2xl transition-all duration-300 ${!webcamExpanded ? "opacity-60 grayscale-[0.5]" : "opacity-100"}`}
							onMouseEnter={() => setIsWebcamHovered(true)}
							onMouseLeave={() => setIsWebcamHovered(false)}
							onFocus={() => setIsWebcamFocused(true)}
							onBlur={() => setIsWebcamFocused(false)}
							style={{ width: webcamExpanded ? "430px" : "140px" }}
						>
							{!webcamExpanded && (
								<div className="min-w-0 flex-1 truncate text-[10px] font-medium text-white/60">
									{selectedCameraLabel}
								</div>
							)}
							{webcamExpanded &&
								(isCameraDevicesLoading ? (
									<span className="text-[10px] italic text-white/40">{t("webcam.searching")}</span>
								) : cameraDevicesError ? (
									<span className="text-[10px] italic text-white/40">
										{t("webcam.unavailable")}
									</span>
								) : cameraDevices.length === 0 ? (
									<span className="text-[10px] italic text-white/40">{t("webcam.noneFound")}</span>
								) : (
									<>
										<div className="relative min-w-0 flex-1">
											<select
												value={webcamDeviceId || selectedCameraId}
												onChange={(e) => {
													setSelectedCameraId(e.target.value);
													setWebcamDeviceId(e.target.value);
												}}
												className="w-full appearance-none rounded-lg border border-white/10 bg-white/5 py-1 pl-2 pr-6 text-[11px] text-white outline-none hover:bg-white/10"
											>
												{cameraDevices.map((device) => (
													<option
														key={device.deviceId}
														value={device.deviceId}
														className="bg-[#1c1c24]"
													>
														{device.label}
													</option>
												))}
											</select>
											<ChevronDown
												size={12}
												className="pointer-events-none absolute right-1.5 top-1/2 -translate-y-1/2 text-white/40"
											/>
										</div>
										<div className="relative w-[104px] shrink-0">
											<select
												aria-label="Webcam shape"
												value={liveStreamLayout.webcamMaskShape}
												onChange={(event) =>
													updateLiveStreamLayout({
														webcamMaskShape: event.target.value as WebcamMaskShape,
													})
												}
												className="w-full appearance-none rounded-lg border border-white/10 bg-white/5 py-1 pl-2 pr-6 text-[11px] text-white outline-none hover:bg-white/10"
											>
												{WEBCAM_SHAPE_OPTIONS.map((shape) => (
													<option key={shape.value} value={shape.value} className="bg-[#1c1c24]">
														{shape.label}
													</option>
												))}
											</select>
											<ChevronDown
												size={12}
												className="pointer-events-none absolute right-1.5 top-1/2 -translate-y-1/2 text-white/40"
											/>
										</div>
										<div className="relative w-[78px] shrink-0">
											<select
												aria-label="Webcam size"
												value={liveStreamLayout.webcamSizePreset}
												onChange={(event) =>
													updateLiveStreamLayout({
														webcamSizePreset: Number(event.target.value),
													})
												}
												className="w-full appearance-none rounded-lg border border-white/10 bg-white/5 py-1 pl-2 pr-6 text-[11px] text-white outline-none hover:bg-white/10"
											>
												{WEBCAM_SIZE_OPTIONS.map((size) => (
													<option key={size.value} value={size.value} className="bg-[#1c1c24]">
														{size.label}
													</option>
												))}
											</select>
											<ChevronDown
												size={12}
												className="pointer-events-none absolute right-1.5 top-1/2 -translate-y-1/2 text-white/40"
											/>
										</div>
									</>
								))}
						</div>
					)}
				</div>
			)}

			<div
				data-hud-interactive="true"
				data-tray-layout={trayLayout}
				className={`fixed bottom-5 left-1/2 flex -translate-x-1/2 rounded-2xl border border-white/[0.10] bg-[#07080a]/90 shadow-[0_20px_60px_rgba(0,0,0,0.42),inset_0_1px_0_rgba(255,255,255,0.06)] backdrop-blur-2xl backdrop-saturate-[140%] ${
					trayLayout === "vertical"
						? "max-h-[calc(100vh-2.5rem)] flex-col items-center gap-1 overflow-y-auto px-1 py-1.5"
						: "items-center gap-1.5 px-2 py-1.5"
				}`}
				onPointerEnter={() => setHudMouseEventsEnabled(true)}
				onPointerDown={() => setHudMouseEventsEnabled(true)}
				onMouseEnter={() => setHudMouseEventsEnabled(true)}
				onMouseLeave={() => {
					if (!isLanguageMenuOpen && !liveSetupOpen) setHudMouseEventsEnabled(false);
				}}
			>
				<div
					className={`flex ${trayLayout === "vertical" ? "h-6 w-8" : "h-8 w-7"} cursor-grab items-center justify-center active:cursor-grabbing ${styles.electronNoDrag}`}
					onPointerDown={handleHudDragPointerDown}
					onPointerMove={handleHudDragPointerMove}
					onPointerUp={handleHudDragPointerEnd}
					onPointerCancel={handleHudDragPointerEnd}
				>
					<RxDragHandleDots2 size={ICON_SIZE} className="text-white/30" />
				</div>

				<Tooltip
					content={
						trayLayout === "horizontal"
							? t("tooltips.useVerticalTray")
							: t("tooltips.useHorizontalTray")
					}
				>
					<button
						data-testid="launch-tray-layout-button"
						type="button"
						aria-label={
							trayLayout === "horizontal"
								? t("tooltips.useVerticalTray")
								: t("tooltips.useHorizontalTray")
						}
						aria-pressed={trayLayout === "vertical"}
						className={`${hudIconBtnClasses} ${styles.electronNoDrag}`}
						onClick={toggleTrayLayout}
					>
						{trayLayout === "horizontal" ? (
							<Columns3 size={ICON_SIZE} className="text-white/60" />
						) : (
							<Rows3 size={ICON_SIZE} className="text-white/60" />
						)}
					</button>
				</Tooltip>

				<div
					className={`${hudGroupClasses} h-8 ${
						trayLayout === "vertical"
							? screenSources.length > 1
								? "w-[150px] px-2.5"
								: "w-8 justify-center px-0"
							: "px-2.5"
					} ${styles.electronNoDrag}`}
					title={selectedSourceLabel}
					aria-label={selectedSourceLabel}
				>
					<MdMonitor size={ICON_SIZE} className="text-white/80" />
					{screenSources.length > 1 ? (
						<div className="relative min-w-0">
							<select
								data-testid="launch-screen-select"
								value={selectedSource?.id ?? ""}
								disabled={streaming}
								onChange={(event) => void selectScreenSource(event.target.value)}
								className="max-w-[120px] appearance-none rounded-md border-0 bg-transparent py-1 pl-1 pr-6 text-[11px] font-medium text-white outline-none hover:text-white/90 focus-visible:ring-1 focus-visible:ring-white/20 disabled:opacity-45"
							>
								{screenSources.map((source, index) => (
									<option key={source.id} value={source.id} className="bg-[#1c1c24]">
										{source.name || `Screen ${index + 1}`}
									</option>
								))}
							</select>
							<ChevronDown
								size={12}
								className="pointer-events-none absolute right-1.5 top-1/2 -translate-y-1/2 text-white/40"
							/>
						</div>
					) : (
						<span
							className={`${trayLayout === "vertical" ? "sr-only" : "max-w-[86px]"} truncate text-[11px] font-medium text-white/75`}
						>
							{screenSourcesLoading && !selectedSource ? "Loading..." : selectedSourceLabel}
						</span>
					)}
				</div>

				<div
					className={`${hudGroupClasses} ${trayLayout === "vertical" ? "flex-col py-1" : ""} ${styles.electronNoDrag}`}
				>
					<button
						data-testid="launch-system-audio-button"
						className={`${hudIconBtnClasses} ${systemAudioEnabled ? "drop-shadow-[0_0_4px_rgba(74,222,128,0.4)]" : ""}`}
						onClick={() => !streaming && setSystemAudioEnabled(!systemAudioEnabled)}
						disabled={streaming}
						title={
							systemAudioEnabled ? t("audio.disableSystemAudio") : t("audio.enableSystemAudio")
						}
					>
						{systemAudioEnabled ? (
							<MdVolumeUp size={ICON_SIZE} className="text-green-400" />
						) : (
							<MdVolumeOff size={ICON_SIZE} className="text-white/40" />
						)}
					</button>
					<button
						data-testid="launch-microphone-button"
						className={`${hudIconBtnClasses} ${microphoneEnabled ? "drop-shadow-[0_0_4px_rgba(74,222,128,0.4)]" : ""}`}
						onClick={() => !streaming && setMicrophoneEnabled(!microphoneEnabled)}
						disabled={streaming}
						title={microphoneEnabled ? t("audio.disableMicrophone") : t("audio.enableMicrophone")}
					>
						{microphoneEnabled ? (
							<MdMic size={ICON_SIZE} className="text-green-400" />
						) : (
							<MdMicOff size={ICON_SIZE} className="text-white/40" />
						)}
					</button>
					<button
						data-testid="launch-webcam-button"
						className={`${hudIconBtnClasses} ${webcamEnabled ? "drop-shadow-[0_0_4px_rgba(74,222,128,0.4)]" : ""}`}
						onClick={() => {
							if (!streaming) void setWebcamEnabled(!webcamEnabled);
						}}
						disabled={streaming}
						title={webcamEnabled ? t("webcam.disableWebcam") : t("webcam.enableWebcam")}
					>
						{webcamEnabled ? (
							<MdVideocam size={ICON_SIZE} className="text-green-400" />
						) : (
							<MdVideocamOff size={ICON_SIZE} className="text-white/40" />
						)}
					</button>
				</div>

				<button
					data-testid="launch-live-stream-button"
					className={`flex items-center justify-center rounded-full p-2 transition-[min-width,background-color] duration-150 ${
						streaming
							? "min-w-[78px] bg-emerald-500/12 hover:bg-emerald-500/16"
							: "min-w-[36px] bg-white/[0.06] hover:bg-white/[0.10]"
					} ${styles.electronNoDrag}`}
					onClick={() => void openLiveStreamSetup()}
					disabled={liveSetupPreparing || (!selectedSource && !streaming)}
					style={{ flex: "0 0 auto" }}
					title={streaming ? "Stop live stream" : "Start live stream"}
				>
					<div className={`flex items-center justify-center ${streaming ? "gap-1.5" : ""}`}>
						{streaming ? (
							<FiX size={ICON_SIZE} className="text-emerald-300" />
						) : (
							<RadioTower
								size={ICON_SIZE}
								className={selectedSource ? "text-white/80" : "text-white/30"}
							/>
						)}
						{streaming && (
							<span className="inline-block w-[34px] text-left text-xs font-semibold tabular-nums text-emerald-300">
								{formatTimePadded(streamElapsedSeconds)}
							</span>
						)}
					</div>
				</button>

				<div
					className={`${trayLayout === "vertical" ? hudSidebarVerticalClasses : hudSidebarClasses} ${styles.electronNoDrag}`}
				>
					<button
						ref={languageTriggerRef}
						type="button"
						aria-label={t("language")}
						aria-expanded={isLanguageMenuOpen}
						aria-haspopup="menu"
						onClick={() => setIsLanguageMenuOpen((open) => !open)}
						title={activeLanguageLabel}
						className={`flex h-8 items-center rounded-lg border border-white/10 bg-white/[0.045] text-white/85 transition-colors hover:bg-white/10 ${
							trayLayout === "vertical" ? "w-8 justify-center px-0" : "gap-1.5 px-2"
						} ${styles.electronNoDrag}`}
					>
						<Languages size={13} className="text-white/70" />
						<span
							className={`${trayLayout === "vertical" ? "sr-only" : "max-w-[54px]"} truncate text-[10px] font-semibold text-white/75`}
						>
							{activeLanguageLabel}
						</span>
					</button>

					{isLanguageMenuOpen
						? createPortal(
								<div
									ref={languageMenuPanelRef}
									data-hud-interactive="true"
									role="menu"
									className={`${styles.languageMenuPanel} ${styles.languageMenuScroll} ${styles.electronNoDrag}`}
									style={
										{
											WebkitAppRegion: "no-drag",
											pointerEvents: "auto",
											right: `${languageMenuStyle.right}px`,
											top: `${languageMenuStyle.top}px`,
											maxHeight: `${languageMenuStyle.maxHeight}px`,
										} as React.CSSProperties
									}
									onPointerDown={(event) => event.stopPropagation()}
									onPointerEnter={() => setHudMouseEventsEnabled(true)}
									onPointerMove={() => setHudMouseEventsEnabled(true)}
								>
									{availableLocales.map((loc) => (
										<button
											key={loc}
											type="button"
											role="menuitemradio"
											aria-checked={loc === locale}
											onClick={() => {
												setLocale(loc);
												resolveSystemLocaleSuggestion();
												setIsLanguageMenuOpen(false);
											}}
											className={`${styles.languageMenuItem} ${loc === locale ? styles.languageMenuItemActive : ""}`}
										>
											<span className="truncate">{getLocaleName(loc)}</span>
											{loc === locale ? <Check size={11} className="text-white/85" /> : null}
										</button>
									))}
								</div>,
								document.body,
							)
						: null}

					<div
						className={`flex items-center gap-0.5 ${trayLayout === "vertical" ? "flex-col" : ""}`}
					>
						<button
							className={windowBtnClasses}
							title={t("tooltips.hideHUD")}
							onClick={() => window.electronAPI?.hudOverlayHide?.()}
						>
							<FiMinus size={ICON_SIZE} className="text-white" />
						</button>
						<button
							className={windowBtnClasses}
							title={t("tooltips.closeApp")}
							onClick={() => window.electronAPI?.hudOverlayClose?.()}
						>
							<FiX size={ICON_SIZE} className="text-white" />
						</button>
					</div>
				</div>
			</div>

			<LiveStreamSetupDialog
				open={liveSetupOpen}
				onOpenChange={setLiveSetupOpen}
				selectedSource={selectedSource}
				layout={liveStreamLayout}
				onStart={handleStartLiveStream}
			/>
		</div>
	);
}
