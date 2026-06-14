import { contextBridge, ipcRenderer } from "electron";

const ASSET_BASE_URL_ARG_PREFIX = "--asset-base-url=";
const assetBaseUrlArg = process.argv.find((arg) => arg.startsWith(ASSET_BASE_URL_ARG_PREFIX));
const assetBaseUrl = assetBaseUrlArg ? assetBaseUrlArg.slice(ASSET_BASE_URL_ARG_PREFIX.length) : "";

contextBridge.exposeInMainWorld("electronAPI", {
	assetBaseUrl,
	hudOverlayHide: () => {
		ipcRenderer.send("hud-overlay-hide");
	},
	hudOverlayClose: () => {
		ipcRenderer.send("hud-overlay-close");
	},
	setHudOverlayIgnoreMouseEvents: (ignore: boolean) => {
		ipcRenderer.send("hud-overlay-ignore-mouse-events", ignore);
	},
	moveHudOverlayBy: (deltaX: number, deltaY: number) => {
		ipcRenderer.send("hud-overlay-move-by", deltaX, deltaY);
	},
	setWebcamPreviewState: (state: WebcamPreviewState | null) => {
		ipcRenderer.send("webcam-preview-state", state);
	},
	onWebcamPreviewStateChanged: (callback: (state: WebcamPreviewState | null) => void) => {
		const listener = (_event: Electron.IpcRendererEvent, state: WebcamPreviewState | null) => {
			callback(state);
		};
		ipcRenderer.on("webcam-preview-state-changed", listener);
		return () => ipcRenderer.removeListener("webcam-preview-state-changed", listener);
	},
	sendWebcamPreviewPosition: (position: WebcamPosition) => {
		ipcRenderer.send("webcam-preview-position-changed", position);
	},
	setWebcamPreviewPointerMode: (mode: "passthrough" | "interactive") => {
		ipcRenderer.send("webcam-preview-pointer-mode", mode);
	},
	getScreenSources: async () => {
		return await ipcRenderer.invoke("get-screen-sources");
	},
	selectSource: (source: ProcessedDesktopSource) => {
		return ipcRenderer.invoke("select-source", source);
	},
	getSelectedSource: () => {
		return ipcRenderer.invoke("get-selected-source");
	},
	captureSelectedSourcePreview: () => {
		return ipcRenderer.invoke("capture-selected-source-preview");
	},
	requestCameraAccess: () => {
		return ipcRenderer.invoke("request-camera-access");
	},
	requestScreenAccess: () => {
		return ipcRenderer.invoke("request-screen-access");
	},
	openExternalUrl: (url: string) => {
		return ipcRenderer.invoke("open-external-url", url);
	},
	copyToClipboard: (text: string) => {
		return ipcRenderer.invoke("copy-to-clipboard", text);
	},
	getPlatform: () => {
		return ipcRenderer.invoke("get-platform");
	},
	youtubeAuthStatus: () => {
		return ipcRenderer.invoke("youtube-auth-status");
	},
	youtubeAuthStart: () => {
		return ipcRenderer.invoke("youtube-auth-start");
	},
	youtubeCreateLiveStream: () => {
		return ipcRenderer.invoke("youtube-create-live-stream");
	},
	youtubeGetBroadcastStatus: (input: { broadcastId: string }) => {
		return ipcRenderer.invoke("youtube-get-broadcast-status", input);
	},
	startLiveStream: (input: {
		destinationUrl: string;
		width: number;
		height: number;
		videoBitrateKbps: number;
	}) => {
		return ipcRenderer.invoke("start-live-stream", input);
	},
	writeLiveStreamChunk: (chunk: ArrayBuffer) => {
		return ipcRenderer.invoke("write-live-stream-chunk", chunk);
	},
	stopLiveStream: () => {
		return ipcRenderer.invoke("stop-live-stream");
	},
	setLocale: (locale: string) => {
		return ipcRenderer.invoke("set-locale", locale);
	},
});
