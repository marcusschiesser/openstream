import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { DEFAULT_STREAM_SERVER_URL, useLiveDestination } from "./useLiveDestination";

describe("useLiveDestination", () => {
	it("defaults to the YouTube RTMP server and an empty stream key", () => {
		const { result } = renderHook(() => useLiveDestination());

		expect(result.current.provider).toBe("rtmp");
		expect(result.current.rtmp.serverUrl).toBe(DEFAULT_STREAM_SERVER_URL);
		expect(result.current.rtmp.streamKey).toBe("");
		expect(result.current.activeDestination).toEqual({
			provider: "rtmp",
			serverUrl: DEFAULT_STREAM_SERVER_URL,
			streamKey: "",
		});
		expect(result.current.isValid).toBe(false);
	});

	it("validates destination input and clears the stream key", () => {
		const { result } = renderHook(() => useLiveDestination());

		act(() => {
			result.current.rtmp.setStreamKey("abc123");
		});
		expect(result.current.validate()).toBe(true);
		expect(result.current.error).toBeNull();

		act(() => {
			result.current.rtmp.clearStreamKey();
		});
		expect(result.current.rtmp.streamKey).toBe("");
		expect(result.current.isValid).toBe(false);
	});

	it("prepares and finishes an RTMP destination", async () => {
		const { result } = renderHook(() => useLiveDestination());

		act(() => {
			result.current.rtmp.setStreamKey("abc123");
		});

		let preparedDestination: Awaited<ReturnType<typeof result.current.prepareStart>>;
		await act(async () => {
			preparedDestination = await result.current.prepareStart();
		});

		expect(preparedDestination).toEqual({
			provider: "rtmp",
			serverUrl: DEFAULT_STREAM_SERVER_URL,
			streamKey: "abc123",
		});

		act(() => {
			result.current.finish();
		});
		expect(result.current.rtmp.streamKey).toBe("");
	});

	it("validates YouTube destination from auth state", async () => {
		window.electronAPI = {
			...window.electronAPI,
			youtubeAuthStatus: async () => ({ configured: true, authenticated: false }),
		} as typeof window.electronAPI;
		const { result } = renderHook(() => useLiveDestination());

		await act(async () => {
			result.current.setProvider("youtube");
			await Promise.resolve();
		});
		await act(async () => {
			expect(result.current.validate()).toBe(false);
		});
		expect(result.current.error).toBe("Sign in with Google to stream to YouTube Live.");

		await act(async () => {
			window.electronAPI = {
				...window.electronAPI,
				youtubeAuthStatus: async () => ({ configured: true, authenticated: true }),
			} as typeof window.electronAPI;
			await result.current.youtube.refreshAuthStatus();
		});
		await act(async () => {
			expect(result.current.validate()).toBe(true);
		});
		expect(result.current.activeDestination).toEqual({
			provider: "youtube",
			isAuthenticated: true,
		});
	});

	it("prepares and cleans up a YouTube destination", async () => {
		window.electronAPI = {
			...window.electronAPI,
			youtubeAuthStatus: async () => ({ configured: true, authenticated: true }),
		} as typeof window.electronAPI;
		const { result } = renderHook(() => useLiveDestination());

		await act(async () => {
			result.current.setProvider("youtube");
			await Promise.resolve();
		});
		act(() => {
			result.current.youtube.setWatchUrl("https://www.youtube.com/watch?v=last");
		});

		let preparedDestination: Awaited<ReturnType<typeof result.current.prepareStart>>;
		await act(async () => {
			preparedDestination = await result.current.prepareStart();
		});

		expect(preparedDestination).toEqual({
			provider: "youtube",
			isAuthenticated: true,
		});
		expect(result.current.youtube.creatingStream).toBe(true);
		expect(result.current.youtube.watchUrl).toBeNull();

		act(() => {
			result.current.cleanup();
		});
		expect(result.current.youtube.creatingStream).toBe(false);
	});
});
