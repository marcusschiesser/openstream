import { beforeEach, describe, expect, it } from "vitest";
import { loadUserPreferences, saveUserPreferences } from "./userPreferences";

describe("user preferences", () => {
	beforeEach(() => {
		localStorage.clear();
	});

	it("persists the tray layout preference", () => {
		saveUserPreferences({ trayLayout: "vertical" });

		expect(loadUserPreferences().trayLayout).toBe("vertical");
	});

	it("falls back to the default tray layout for invalid stored values", () => {
		localStorage.setItem("openstream_user_preferences", JSON.stringify({ trayLayout: "diagonal" }));

		expect(loadUserPreferences().trayLayout).toBe("horizontal");
	});
});
