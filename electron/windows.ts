import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { BrowserWindow, ipcMain, screen } from "electron";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const APP_ROOT = path.join(__dirname, "..");
const VITE_DEV_SERVER_URL = process.env["VITE_DEV_SERVER_URL"];
const RENDERER_DIST = path.join(APP_ROOT, "dist");
const HEADLESS = process.env["HEADLESS"] === "true";

const ASSET_BASE_DIR = process.defaultApp
	? path.join(__dirname, "..", "public")
	: process.resourcesPath;
const ASSET_BASE_URL_ARG = `--asset-base-url=${pathToFileURL(`${ASSET_BASE_DIR}${path.sep}`).toString()}`;

let hudOverlayWindow: BrowserWindow | null = null;
let webcamPreviewWindow: BrowserWindow | null = null;
let webcamPreviewState: WebcamPreviewState | null = null;
let hudOverlayHiddenToTray = false;

const HUD_COMPACT_WIDTH = 600;
const HUD_COMPACT_HEIGHT = 160;

type SelectedPreviewSource = {
	id: string;
	display_id: string;
};

type WebcamPreviewState = {
	enabled: boolean;
	source: SelectedPreviewSource | null;
	webcamDeviceId?: string;
	layout: {
		webcamMaskShape: "rectangle" | "circle" | "square" | "rounded";
		webcamSizePreset: number;
		webcamPosition: { cx: number; cy: number } | null;
	};
};

function getCompactBounds(workArea: Electron.Rectangle): Electron.Rectangle {
	return {
		width: HUD_COMPACT_WIDTH,
		height: HUD_COMPACT_HEIGHT,
		x: Math.floor(workArea.x + (workArea.width - HUD_COMPACT_WIDTH) / 2),
		y: Math.floor(workArea.y + workArea.height - HUD_COMPACT_HEIGHT - 5),
	};
}

function getSourceOverlayBounds(source: SelectedPreviewSource): Electron.Rectangle {
	const displays = screen.getAllDisplays();
	const matchingDisplay = source.display_id
		? displays.find((display) => String(display.id) === String(source.display_id))
		: null;
	if (matchingDisplay) {
		return matchingDisplay.workArea;
	}

	const currentBounds = hudOverlayWindow?.isDestroyed() ? null : hudOverlayWindow?.getBounds();
	const fallbackDisplay = currentBounds
		? screen.getDisplayMatching(currentBounds)
		: screen.getPrimaryDisplay();
	return fallbackDisplay.workArea;
}

ipcMain.on("hud-overlay-hide", () => hideHudOverlayToTray());

ipcMain.on("hud-overlay-ignore-mouse-events", () => {
	if (hudOverlayWindow && !hudOverlayWindow.isDestroyed()) {
		// The compact HUD must remain interactive at the OS window level. If it is
		// click-through, the renderer cannot reliably receive the hover/click that
		// should wake controls such as Destination, so clicks can fall through to the
		// app underneath. The separate webcam preview window still owns pass-through
		// behavior for the screen-sized overlay.
		hudOverlayWindow.setIgnoreMouseEvents(false);
	}
});

ipcMain.on("hud-overlay-move-by", (_event, deltaX: number, deltaY: number) => {
	if (
		!hudOverlayWindow ||
		hudOverlayWindow.isDestroyed() ||
		!Number.isFinite(deltaX) ||
		!Number.isFinite(deltaY)
	) {
		return;
	}

	const [x, y] = hudOverlayWindow.getPosition();
	const nextX = Math.round(x + deltaX);
	const nextY = Math.round(y + deltaY);
	if (!Number.isFinite(nextX) || !Number.isFinite(nextY)) {
		return;
	}
	hudOverlayWindow.setPosition(nextX, nextY, false);
});

function sendWebcamPreviewStateToPreview() {
	if (webcamPreviewWindow && !webcamPreviewWindow.isDestroyed()) {
		webcamPreviewWindow.webContents.send("webcam-preview-state-changed", webcamPreviewState);
	}
}

function sendWebcamPreviewStateToHud() {
	if (hudOverlayWindow && !hudOverlayWindow.isDestroyed()) {
		hudOverlayWindow.webContents.send("webcam-preview-state-changed", webcamPreviewState);
	}
}

function sendHudOverlayRestored() {
	if (hudOverlayWindow && !hudOverlayWindow.isDestroyed()) {
		hudOverlayWindow.webContents.send("hud-overlay-restored");
	}
}

function hideWebcamPreviewWindow() {
	if (webcamPreviewWindow && !webcamPreviewWindow.isDestroyed()) {
		webcamPreviewWindow.hide();
		webcamPreviewWindow.setIgnoreMouseEvents(true, { forward: true });
	}
}

function applyWebcamPreviewWindowState() {
	if (hudOverlayHiddenToTray) {
		hideWebcamPreviewWindow();
		sendWebcamPreviewStateToPreview();
		return;
	}

	if (!webcamPreviewState?.enabled || !webcamPreviewState.source) {
		hideWebcamPreviewWindow();
		sendWebcamPreviewStateToPreview();
		return;
	}

	const win = webcamPreviewWindow ?? createWebcamPreviewWindow();
	const bounds = getSourceOverlayBounds(webcamPreviewState.source);
	win.setMinimumSize(bounds.width, bounds.height);
	win.setMaximumSize(bounds.width, bounds.height);
	win.setBounds(bounds, false);
	win.setIgnoreMouseEvents(true, { forward: true });
	if (!HEADLESS && !win.isVisible()) {
		win.showInactive();
	}
	if (hudOverlayWindow && !hudOverlayWindow.isDestroyed()) {
		hudOverlayWindow.moveTop();
	}
	sendWebcamPreviewStateToPreview();
}

ipcMain.on("webcam-preview-state", (_event, state: WebcamPreviewState | null) => {
	webcamPreviewState = state;
	applyWebcamPreviewWindowState();
});

ipcMain.on("webcam-preview-pointer-mode", (_event, mode: "passthrough" | "interactive") => {
	if (webcamPreviewWindow && !webcamPreviewWindow.isDestroyed()) {
		webcamPreviewWindow.setIgnoreMouseEvents(mode === "passthrough", { forward: true });
	}
});

ipcMain.on("webcam-preview-position-changed", (_event, position: { cx: number; cy: number }) => {
	if (!webcamPreviewState) return;
	webcamPreviewState = {
		...webcamPreviewState,
		layout: {
			...webcamPreviewState.layout,
			webcamPosition: position,
		},
	};
	if (hudOverlayWindow && !hudOverlayWindow.isDestroyed()) {
		sendWebcamPreviewStateToHud();
	}
	sendWebcamPreviewStateToPreview();
});

export function createHudOverlayWindow(): BrowserWindow {
	const { workArea } = screen.getPrimaryDisplay();
	const compactBounds = getCompactBounds(workArea);

	const win = new BrowserWindow({
		width: HUD_COMPACT_WIDTH,
		height: HUD_COMPACT_HEIGHT,
		minWidth: HUD_COMPACT_WIDTH,
		maxWidth: HUD_COMPACT_WIDTH,
		minHeight: HUD_COMPACT_HEIGHT,
		maxHeight: HUD_COMPACT_HEIGHT,
		x: compactBounds.x,
		y: compactBounds.y,
		frame: false,
		transparent: true,
		resizable: false,
		alwaysOnTop: true,
		skipTaskbar: true,
		hasShadow: false,
		show: false,
		webPreferences: {
			preload: path.join(__dirname, "preload.mjs"),
			additionalArguments: [ASSET_BASE_URL_ARG],
			nodeIntegration: false,
			contextIsolation: true,
			backgroundThrottling: false,
		},
	});
	win.setIgnoreMouseEvents(false);

	if (process.platform === "darwin") {
		win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
	}

	win.once("ready-to-show", () => {
		if (!HEADLESS && !hudOverlayHiddenToTray) win.show();
	});

	hudOverlayWindow = win;
	win.on("closed", () => {
		if (hudOverlayWindow === win) {
			hudOverlayWindow = null;
		}
	});

	if (VITE_DEV_SERVER_URL) {
		win.loadURL(`${VITE_DEV_SERVER_URL}?windowType=hud-overlay`);
	} else {
		win.loadFile(path.join(RENDERER_DIST, "index.html"), {
			query: { windowType: "hud-overlay" },
		});
	}

	return win;
}

export function hideHudOverlayToTray() {
	hudOverlayHiddenToTray = true;
	hideWebcamPreviewWindow();
	if (hudOverlayWindow && !hudOverlayWindow.isDestroyed()) {
		hudOverlayWindow.hide();
	}
}

export function isHudOverlayHiddenToTray(): boolean {
	return hudOverlayHiddenToTray;
}

export function showHudOverlayFromTray(): BrowserWindow | null {
	hudOverlayHiddenToTray = false;
	if (!hudOverlayWindow || hudOverlayWindow.isDestroyed()) {
		return null;
	}
	if (hudOverlayWindow.isMinimized()) {
		hudOverlayWindow.restore();
	}
	hudOverlayWindow.show();
	hudOverlayWindow.focus();
	sendHudOverlayRestored();
	applyWebcamPreviewWindowState();
	return hudOverlayWindow;
}

export function createWebcamPreviewWindow(): BrowserWindow {
	if (webcamPreviewWindow && !webcamPreviewWindow.isDestroyed()) {
		return webcamPreviewWindow;
	}

	const { workArea } = screen.getPrimaryDisplay();
	const win = new BrowserWindow({
		x: workArea.x,
		y: workArea.y,
		width: workArea.width,
		height: workArea.height,
		minWidth: workArea.width,
		maxWidth: workArea.width,
		minHeight: workArea.height,
		maxHeight: workArea.height,
		frame: false,
		transparent: true,
		resizable: false,
		alwaysOnTop: true,
		skipTaskbar: true,
		hasShadow: false,
		show: false,
		focusable: false,
		webPreferences: {
			preload: path.join(__dirname, "preload.mjs"),
			additionalArguments: [ASSET_BASE_URL_ARG],
			nodeIntegration: false,
			contextIsolation: true,
			backgroundThrottling: false,
		},
	});
	win.setIgnoreMouseEvents(true, { forward: true });

	if (process.platform === "darwin") {
		win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
	}

	win.once("ready-to-show", () => {
		if (webcamPreviewState?.enabled && !HEADLESS && !hudOverlayHiddenToTray) {
			win.showInactive();
		}
		sendWebcamPreviewStateToPreview();
	});

	win.webContents.on("did-finish-load", () => {
		sendWebcamPreviewStateToPreview();
	});

	webcamPreviewWindow = win;
	win.on("closed", () => {
		if (webcamPreviewWindow === win) {
			webcamPreviewWindow = null;
		}
	});

	if (VITE_DEV_SERVER_URL) {
		win.loadURL(`${VITE_DEV_SERVER_URL}?windowType=webcam-preview`);
	} else {
		win.loadFile(path.join(RENDERER_DIST, "index.html"), {
			query: { windowType: "webcam-preview" },
		});
	}

	return win;
}
