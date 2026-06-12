import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { DEFAULT_STREAM_SERVER_URL, useLiveDestination } from "./useLiveDestination";

describe("useLiveDestination", () => {
	it("defaults to the YouTube RTMP server and an empty stream key", () => {
		const { result } = renderHook(() => useLiveDestination());

		expect(result.current.serverUrl).toBe(DEFAULT_STREAM_SERVER_URL);
		expect(result.current.streamKey).toBe("");
		expect(result.current.isValid).toBe(false);
	});

	it("validates destination input and clears the stream key", () => {
		const { result } = renderHook(() => useLiveDestination());

		act(() => {
			result.current.setStreamKey("abc123");
		});
		expect(result.current.validate()).toBe(true);
		expect(result.current.error).toBeNull();

		act(() => {
			result.current.clearStreamKey();
		});
		expect(result.current.streamKey).toBe("");
		expect(result.current.isValid).toBe(false);
	});
});
