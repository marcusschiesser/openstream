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
	setHudOverlayExpanded: (expanded: boolean) => {
		ipcRenderer.send("hud-overlay-expanded", expanded);
	},
	moveHudOverlayBy: (deltaX: number, deltaY: number) => {
		ipcRenderer.send("hud-overlay-move-by", deltaX, deltaY);
	},
	getSources: async (opts: Electron.SourcesOptions) => {
		return await ipcRenderer.invoke("get-sources", opts);
	},
	openSourceSelector: () => {
		return ipcRenderer.invoke("open-source-selector");
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
	getPlatform: () => {
		return ipcRenderer.invoke("get-platform");
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
