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
let hudOverlayCompactBounds: Electron.Rectangle | null = null;
let hudOverlayExpanded = false;
let webcamPreviewWindow: BrowserWindow | null = null;
let webcamPreviewState: WebcamPreviewState | null = null;

const HUD_COMPACT_WIDTH = 600;
const HUD_COMPACT_HEIGHT = 160;
const HUD_EXPANDED_WIDTH = 1000;
const HUD_EXPANDED_HEIGHT = 760;

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

function applyHudOverlayBounds() {
	if (!hudOverlayWindow || hudOverlayWindow.isDestroyed()) {
		return;
	}

	const currentDisplay = screen.getDisplayMatching(hudOverlayWindow.getBounds());
	const workArea = currentDisplay.workArea;

	if (hudOverlayExpanded) {
		if (!hudOverlayCompactBounds) {
			hudOverlayCompactBounds = hudOverlayWindow.getBounds();
		}

		const width = Math.min(HUD_EXPANDED_WIDTH, workArea.width);
		const height = Math.min(HUD_EXPANDED_HEIGHT, workArea.height);
		hudOverlayWindow.setMinimumSize(width, height);
		hudOverlayWindow.setMaximumSize(width, height);
		hudOverlayWindow.setBounds(
			{
				x: Math.round(workArea.x + (workArea.width - width) / 2),
				y: Math.round(workArea.y + (workArea.height - height) / 2),
				width,
				height,
			},
			false,
		);
		return;
	}

	const compactBounds = hudOverlayCompactBounds ?? getCompactBounds(workArea);
	hudOverlayWindow.setMinimumSize(HUD_COMPACT_WIDTH, HUD_COMPACT_HEIGHT);
	hudOverlayWindow.setMaximumSize(HUD_COMPACT_WIDTH, HUD_COMPACT_HEIGHT);
	hudOverlayWindow.setBounds(compactBounds, false);
	hudOverlayCompactBounds = null;
}

ipcMain.on("hud-overlay-hide", () => {
	if (hudOverlayWindow && !hudOverlayWindow.isDestroyed()) {
		hudOverlayWindow.minimize();
	}
});

ipcMain.on("hud-overlay-ignore-mouse-events", (_event, ignore: boolean) => {
	if (hudOverlayWindow && !hudOverlayWindow.isDestroyed()) {
		hudOverlayWindow.setIgnoreMouseEvents(ignore, { forward: true });
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

ipcMain.on("hud-overlay-expanded", (_event, expanded: boolean) => {
	hudOverlayExpanded = expanded;
	applyHudOverlayBounds();
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

function hideWebcamPreviewWindow() {
	if (webcamPreviewWindow && !webcamPreviewWindow.isDestroyed()) {
		webcamPreviewWindow.hide();
		webcamPreviewWindow.setIgnoreMouseEvents(true, { forward: true });
	}
}

function applyWebcamPreviewWindowState() {
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
	win.setIgnoreMouseEvents(true, { forward: true });

	if (process.platform === "darwin") {
		win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
	}

	win.once("ready-to-show", () => {
		if (!HEADLESS) win.show();
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
		if (webcamPreviewState?.enabled && !HEADLESS) win.showInactive();
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
