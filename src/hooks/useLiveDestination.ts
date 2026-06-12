import { useCallback, useMemo, useState } from "react";
import { type LiveStreamDestinationInput, validateLiveStreamDestination } from "@/lib/liveStream";

export const DEFAULT_STREAM_SERVER_URL = "rtmp://a.rtmp.youtube.com/live2";

export function useLiveDestination() {
	const [serverUrl, setServerUrlState] = useState(DEFAULT_STREAM_SERVER_URL);
	const [streamKey, setStreamKeyState] = useState("");
	const [error, setError] = useState<string | null>(null);

	const destination = useMemo<LiveStreamDestinationInput>(
		() => ({ serverUrl, streamKey }),
		[serverUrl, streamKey],
	);
	const isValid = useMemo(() => !validateLiveStreamDestination(destination), [destination]);

	const setServerUrl = useCallback((nextServerUrl: string) => {
		setServerUrlState(nextServerUrl);
		setError(null);
	}, []);

	const setStreamKey = useCallback((nextStreamKey: string) => {
		setStreamKeyState(nextStreamKey);
		setError(null);
	}, []);

	const validate = useCallback(() => {
		const validationError = validateLiveStreamDestination(destination);
		setError(validationError);
		return !validationError;
	}, [destination]);

	const clearStreamKey = useCallback(() => {
		setStreamKeyState("");
		setError(null);
	}, []);

	return {
		serverUrl,
		setServerUrl,
		streamKey,
		setStreamKey,
		error,
		isValid,
		validate,
		clearStreamKey,
	};
}
