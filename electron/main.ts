import path from "node:path";
import { fileURLToPath } from "node:url";
import {
	app,
	BrowserWindow,
	ipcMain,
	Menu,
	nativeImage,
	session,
	systemPreferences,
	Tray,
} from "electron";
import { registerOpenAppShortcut, unregisterAllGlobalShortcuts } from "./globalShortcut";
import { mainT, setMainLocale } from "./i18n";
import { getSelectedDesktopSource, registerIpcHandlers } from "./ipc/handlers";
import { createHudOverlayWindow, createSourceSelectorWindow } from "./windows";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

if (process.platform === "darwin") {
	app.commandLine.appendSwitch("disable-features", "MacCatapLoopbackAudioForScreenShare");
}

if (process.platform === "linux") {
	const isWayland =
		process.env.XDG_SESSION_TYPE === "wayland" || process.env.WAYLAND_DISPLAY !== undefined;
	if (isWayland) {
		app.commandLine.appendSwitch("ozone-platform", "wayland");
		app.commandLine.appendSwitch("enable-features", "WaylandWindowDrag,WebRTCPipeWireCapturer");
	}
}

process.env.APP_ROOT = path.join(__dirname, "..");
export const VITE_DEV_SERVER_URL = process.env["VITE_DEV_SERVER_URL"];
export const RENDERER_DIST = path.join(process.env.APP_ROOT, "dist");

process.env.VITE_PUBLIC = VITE_DEV_SERVER_URL
	? path.join(process.env.APP_ROOT, "public")
	: RENDERER_DIST;

let mainWindow: BrowserWindow | null = null;
let sourceSelectorWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
const trayIconSize = process.platform === "darwin" ? 16 : 24;
const defaultTrayIcon = getTrayIcon("openstream.png", trayIconSize);

function createWindow() {
	mainWindow = createHudOverlayWindow();
}

function showMainWindow() {
	if (mainWindow && !mainWindow.isDestroyed()) {
		if (mainWindow.isMinimized()) {
			mainWindow.restore();
		}
		mainWindow.show();
		mainWindow.focus();
		return;
	}
	createWindow();
}

function setupApplicationMenu() {
	const template: Electron.MenuItemConstructorOptions[] = [];
	if (process.platform === "darwin") {
		template.push({
			label: app.name,
			submenu: [
				{ role: "about", label: mainT("common", "actions.about") || "About OpenStream" },
				{ type: "separator" },
				{ role: "services", label: mainT("common", "actions.services") || "Services" },
				{ type: "separator" },
				{ role: "hide", label: mainT("common", "actions.hide") || "Hide OpenStream" },
				{ role: "hideOthers", label: mainT("common", "actions.hideOthers") || "Hide Others" },
				{ role: "unhide", label: mainT("common", "actions.unhide") || "Show All" },
				{ type: "separator" },
				{ role: "quit", label: mainT("common", "actions.quit") || "Quit" },
			],
		});
	}

	template.push(
		{
			label: mainT("common", "actions.file") || "File",
			submenu:
				process.platform === "darwin"
					? []
					: [{ role: "quit", label: mainT("common", "actions.quit") || "Quit" }],
		},
		{
			label: mainT("common", "actions.edit") || "Edit",
			submenu: [
				{ role: "undo", label: mainT("common", "actions.undo") || "Undo" },
				{ role: "redo", label: mainT("common", "actions.redo") || "Redo" },
				{ type: "separator" },
				{ role: "cut", label: mainT("common", "actions.cut") || "Cut" },
				{ role: "copy", label: mainT("common", "actions.copy") || "Copy" },
				{ role: "paste", label: mainT("common", "actions.paste") || "Paste" },
				{ role: "selectAll", label: mainT("common", "actions.selectAll") || "Select All" },
			],
		},
		{
			label: mainT("common", "actions.view") || "View",
			submenu: [
				{ role: "reload", label: mainT("common", "actions.reload") || "Reload" },
				{ role: "forceReload", label: mainT("common", "actions.forceReload") || "Force Reload" },
				{
					role: "toggleDevTools",
					label: mainT("common", "actions.toggleDevTools") || "Toggle Developer Tools",
				},
			],
		},
		{
			label: mainT("common", "actions.window") || "Window",
			submenu: [{ role: "minimize", label: mainT("common", "actions.minimize") || "Minimize" }],
		},
	);

	Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function getTrayIcon(filename: string, size: number) {
	return nativeImage
		.createFromPath(path.join(process.env.VITE_PUBLIC || RENDERER_DIST, filename))
		.resize({ width: size, height: size, quality: "best" });
}

function createTray() {
	tray = new Tray(defaultTrayIcon);
	tray.on("click", showMainWindow);
	tray.on("double-click", showMainWindow);
	updateTrayMenu();
}

function updateTrayMenu() {
	if (!tray) return;
	tray.setImage(defaultTrayIcon);
	tray.setToolTip("OpenStream");
	tray.setContextMenu(
		Menu.buildFromTemplate([
			{ label: mainT("common", "actions.open") || "Open", click: showMainWindow },
			{ label: mainT("common", "actions.quit") || "Quit", click: () => app.quit() },
		]),
	);
}

function createSourceSelectorWindowWrapper() {
	sourceSelectorWindow = createSourceSelectorWindow();
	sourceSelectorWindow.on("closed", () => {
		sourceSelectorWindow = null;
	});
	return sourceSelectorWindow;
}

app.on("window-all-closed", () => {
	app.quit();
});

app.on("activate", () => {
	const hasVisibleWindow = BrowserWindow.getAllWindows().some(
		(window) => !window.isDestroyed() && window.isVisible(),
	);
	if (!hasVisibleWindow) {
		showMainWindow();
	}
});

app.on("will-quit", () => {
	unregisterAllGlobalShortcuts();
});

app.whenReady().then(async () => {
	if (process.platform === "darwin") {
		app.dock?.show();
	}

	session.defaultSession.setPermissionCheckHandler((_webContents, permission) => {
		return [
			"media",
			"audioCapture",
			"microphone",
			"videoCapture",
			"camera",
			"screen",
			"display-capture",
		].includes(permission);
	});

	session.defaultSession.setPermissionRequestHandler((_webContents, permission, callback) => {
		callback(
			[
				"media",
				"audioCapture",
				"microphone",
				"videoCapture",
				"camera",
				"screen",
				"display-capture",
			].includes(permission),
		);
	});

	session.defaultSession.setDisplayMediaRequestHandler(
		(request, callback) => {
			const source = getSelectedDesktopSource();
			if (!request.videoRequested || !source) {
				callback({});
				return;
			}
			callback({
				video: source,
				...(request.audioRequested && process.platform === "win32" ? { audio: "loopback" } : {}),
			});
		},
		{ useSystemPicker: false },
	);

	if (process.platform === "darwin") {
		const micStatus = systemPreferences.getMediaAccessStatus("microphone");
		if (micStatus !== "granted") {
			await systemPreferences.askForMediaAccess("microphone");
		}
	}

	ipcMain.on("hud-overlay-close", () => app.quit());
	ipcMain.handle("set-locale", (_, locale: string) => {
		setMainLocale(locale);
		setupApplicationMenu();
		updateTrayMenu();
	});

	createTray();
	setupApplicationMenu();
	registerIpcHandlers(
		createSourceSelectorWindowWrapper,
		() => mainWindow,
		() => sourceSelectorWindow,
	);
	registerOpenAppShortcut(showMainWindow);
	createWindow();
});
