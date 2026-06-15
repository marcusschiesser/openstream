import path from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv, type UserConfig } from "vite";
import electron from "vite-plugin-electron/simple";

function readRequiredBuildEnv(name: string, command: string, env: Record<string, string>) {
	const value = env[name];
	if (command === "build" && !value) {
		throw new Error(`Missing required build environment variable: ${name}`);
	}
	return value;
}

// https://vitejs.dev/config/
export default defineConfig(({ command, mode }) => {
	const appEnv = { ...loadEnv(mode, process.cwd(), ""), ...process.env };
	const youtubeClientId = readRequiredBuildEnv("YOUTUBE_CLIENT_ID", command, appEnv);
	const youtubeClientSecret = readRequiredBuildEnv("YOUTUBE_CLIENT_SECRET", command, appEnv);
	const electronMainConfig: UserConfig = {
		define: {
			__OPENSTREAM_YOUTUBE_CLIENT_ID__: youtubeClientId
				? JSON.stringify(youtubeClientId)
				: "undefined",
			__OPENSTREAM_YOUTUBE_CLIENT_SECRET__: youtubeClientSecret
				? JSON.stringify(youtubeClientSecret)
				: "undefined",
		},
		build: {},
	};

	return {
		plugins: [
			react(),
			electron({
				main: {
					entry: "electron/main.ts",
					onstart({ startup }) {
						const startupEnv = { ...appEnv };
						delete startupEnv.ELECTRON_RUN_AS_NODE;
						return startup(["."], { env: startupEnv });
					},
					vite: electronMainConfig,
				},
				preload: {
					input: path.join(__dirname, "electron/preload.ts"),
				},
				renderer: process.env.NODE_ENV === "test" ? undefined : {},
			}),
		],
		resolve: {
			alias: {
				"@": path.resolve(__dirname, "src"),
			},
		},
		build: {
			target: "esnext",
			minify: "terser",
			terserOptions: {
				compress: {
					drop_console: true,
					drop_debugger: true,
					pure_funcs: ["console.log", "console.debug"],
				},
			},
			rollupOptions: {
				output: {
					manualChunks(id) {
						if (id.includes("pixi.js") || id.includes("pixi-filters") || id.includes("@pixi/"))
							return "pixi";
						if (id.includes("react-dom") || id.includes("/react/")) return "react-vendor";
						if (
							id.includes("mediabunny") ||
							id.includes("mp4box") ||
							id.includes("fix-webm-duration")
						)
							return "video-processing";
					},
				},
			},
			chunkSizeWarningLimit: 1000,
		},
	};
});
