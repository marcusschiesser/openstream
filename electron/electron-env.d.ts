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
		getSources: (opts: Electron.SourcesOptions) => Promise<ProcessedDesktopSource[]>;
		openSourceSelector: () => Promise<{
			opened: boolean;
			reason?: string;
			access?: {
				success: boolean;
				granted: boolean;
				status: string;
				error?: string;
			};
		}>;
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
		setHudOverlayExpanded: (expanded: boolean) => void;
		moveHudOverlayBy: (deltaX: number, deltaY: number) => void;
		setLocale: (locale: string) => Promise<void>;
	};
}

interface ProcessedDesktopSource {
	id: string;
	name: string;
	display_id: string;
	thumbnail: string | null;
	appIcon: string | null;
}
