import { globalShortcut } from "electron";

const OPEN_APP_ACCELERATOR = "CommandOrControl+Shift+O";

export function registerOpenAppShortcut(onTrigger: () => void): boolean {
	const success = globalShortcut.register(OPEN_APP_ACCELERATOR, onTrigger);
	if (!success) {
		console.warn(`Failed to register global shortcut: ${OPEN_APP_ACCELERATOR}`);
	}
	return success;
}

export function unregisterAllGlobalShortcuts(): void {
	globalShortcut.unregisterAll();
}
