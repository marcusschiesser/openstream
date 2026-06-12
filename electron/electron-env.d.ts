/// <reference types="vite-plugin-electron/electron-env" />

declare namespace NodeJS {
	interface ProcessEnv {
		APP_ROOT: string;
		VITE_PUBLIC: string;
	}
}

interface Window {
	electronAPI: {
		assetBaseUrl: string;
		getScreenSources: () => Promise<ProcessedDesktopSource[]>;
		selectSource: (source: ProcessedDesktopSource) => Promise<ProcessedDesktopSource | null>;
		getSelectedSource: () => Promise<ProcessedDesktopSource | null>;
		captureSelectedSourcePreview: () => Promise<ProcessedDesktopSource | null>;
		requestCameraAccess: () => Promise<{
			success: boolean;
			granted: boolean;
			status: string;
			error?: string;
		}>;
		requestScreenAccess: () => Promise<{
			success: boolean;
			granted: boolean;
			status: string;
			error?: string;
		}>;
		openExternalUrl: (url: string) => Promise<{ success: boolean; error?: string }>;
		getPlatform: () => Promise<string>;
		startLiveStream: (input: {
			destinationUrl: string;
			width: number;
			height: number;
			videoBitrateKbps: number;
		}) => Promise<{ success: boolean; error?: string }>;
		writeLiveStreamChunk: (chunk: ArrayBuffer) => Promise<{ success: boolean; error?: string }>;
		stopLiveStream: () => Promise<{ success: boolean; error?: string }>;
		hudOverlayHide: () => void;
		hudOverlayClose: () => void;
		setHudOverlayIgnoreMouseEvents: (ignore: boolean) => void;
		moveHudOverlayBy: (deltaX: number, deltaY: number) => void;
		/** HUD -> main: show, update, or hide the separate screen-bound webcam preview window. */
		setWebcamPreviewState: (state: WebcamPreviewState | null) => void;
		/** Main -> renderers: publish the latest preview config, including drag-updated position. */
		onWebcamPreviewStateChanged: (
			callback: (state: WebcamPreviewState | null) => void,
		) => () => void;
		/** Preview -> main: send normalized PiP center coordinates after dragging the webcam. */
		sendWebcamPreviewPosition: (position: WebcamPosition) => void;
		/** Preview -> main: toggle OS-level click-through for the full-screen transparent window. */
		setWebcamPreviewPointerMode: (mode: "passthrough" | "interactive") => void;
		setLocale: (locale: string) => Promise<void>;
	};
}

interface ProcessedDesktopSource {
	id: string;
	name: string;
	display_id: string;
	thumbnail: string | null;
}

interface WebcamPosition {
	cx: number;
	cy: number;
}

interface WebcamPreviewState {
	enabled: boolean;
	source: { id: string; display_id: string } | null;
	webcamDeviceId?: string;
	layout: {
		webcamMaskShape: "rectangle" | "circle" | "square" | "rounded";
		webcamSizePreset: number;
		webcamPosition: WebcamPosition | null;
	};
}
