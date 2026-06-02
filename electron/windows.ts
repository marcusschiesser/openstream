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

const HUD_COMPACT_WIDTH = 600;
const HUD_COMPACT_HEIGHT = 160;
const HUD_EXPANDED_WIDTH = 1000;
const HUD_EXPANDED_HEIGHT = 760;

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
	hudOverlayWindow.setPosition(Math.round(x + deltaX), Math.round(y + deltaY), false);
});

ipcMain.on("hud-overlay-expanded", (_event, expanded: boolean) => {
	if (!hudOverlayWindow || hudOverlayWindow.isDestroyed()) {
		return;
	}

	const { workArea } = screen.getDisplayMatching(hudOverlayWindow.getBounds());
	if (expanded) {
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

	const compactBounds = hudOverlayCompactBounds ?? {
		width: HUD_COMPACT_WIDTH,
		height: HUD_COMPACT_HEIGHT,
		x: Math.floor(workArea.x + (workArea.width - HUD_COMPACT_WIDTH) / 2),
		y: Math.floor(workArea.y + workArea.height - HUD_COMPACT_HEIGHT - 5),
	};
	hudOverlayWindow.setMinimumSize(HUD_COMPACT_WIDTH, HUD_COMPACT_HEIGHT);
	hudOverlayWindow.setMaximumSize(HUD_COMPACT_WIDTH, HUD_COMPACT_HEIGHT);
	hudOverlayWindow.setBounds(compactBounds, false);
	hudOverlayCompactBounds = null;
});

export function createHudOverlayWindow(): BrowserWindow {
	const { workArea } = screen.getPrimaryDisplay();
	const x = Math.floor(workArea.x + (workArea.width - HUD_COMPACT_WIDTH) / 2);
	const y = Math.floor(workArea.y + workArea.height - HUD_COMPACT_HEIGHT - 5);

	const win = new BrowserWindow({
		width: HUD_COMPACT_WIDTH,
		height: HUD_COMPACT_HEIGHT,
		minWidth: HUD_COMPACT_WIDTH,
		maxWidth: HUD_COMPACT_WIDTH,
		minHeight: HUD_COMPACT_HEIGHT,
		maxHeight: HUD_COMPACT_HEIGHT,
		x,
		y,
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

export function createSourceSelectorWindow(): BrowserWindow {
	const { width, height } = screen.getPrimaryDisplay().workAreaSize;
	const win = new BrowserWindow({
		width: 620,
		height: 420,
		minHeight: 350,
		maxHeight: 500,
		x: Math.round((width - 620) / 2),
		y: Math.round((height - 420) / 2),
		frame: false,
		resizable: false,
		alwaysOnTop: true,
		transparent: true,
		backgroundColor: "#00000000",
		webPreferences: {
			preload: path.join(__dirname, "preload.mjs"),
			additionalArguments: [ASSET_BASE_URL_ARG],
			nodeIntegration: false,
			contextIsolation: true,
		},
	});

	if (process.platform === "darwin") {
		win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
	}

	if (VITE_DEV_SERVER_URL) {
		win.loadURL(`${VITE_DEV_SERVER_URL}?windowType=source-selector`);
	} else {
		win.loadFile(path.join(RENDERER_DIST, "index.html"), {
			query: { windowType: "source-selector" },
		});
	}

	return win;
}
