import { useCallback, useMemo, useState } from "react";
import { loadLaunchPreferences, saveLaunchPreferencesPatch } from "@/lib/launchPreferences";
import {
	type LiveStreamDestinationInput,
	type LiveStreamDestinationProvider,
	validateLiveStreamDestination,
} from "@/lib/liveStream";

export const DEFAULT_STREAM_SERVER_URL = "rtmp://a.rtmp.youtube.com/live2";

type SetDestinationError = (error: string | null) => void;

function useRtmpDestinationState(setError: SetDestinationError) {
	const [serverUrl, setServerUrlState] = useState(
		() => loadLaunchPreferences().rtmpServerUrl ?? DEFAULT_STREAM_SERVER_URL,
	);
	const [streamKey, setStreamKeyState] = useState("");

	const setServerUrl = useCallback(
		(nextServerUrl: string) => {
			setServerUrlState(nextServerUrl);
			saveLaunchPreferencesPatch({ rtmpServerUrl: nextServerUrl });
			setError(null);
		},
		[setError],
	);

	const setStreamKey = useCallback(
		(nextStreamKey: string) => {
			setStreamKeyState(nextStreamKey);
			setError(null);
		},
		[setError],
	);

	const clearStreamKey = useCallback(() => {
		setStreamKeyState("");
		setError(null);
	}, [setError]);

	const destination = useMemo(
		() => ({ provider: "rtmp" as const, serverUrl, streamKey }),
		[serverUrl, streamKey],
	);

	return {
		destination,
		serverUrl,
		setServerUrl,
		streamKey,
		setStreamKey,
		clearStreamKey,
	};
}

function useYouTubeDestinationState(setError: SetDestinationError) {
	const [youtubeAuthenticated, setYoutubeAuthenticated] = useState(false);
	const [youtubeAuthLoading, setYoutubeAuthLoading] = useState(false);
	const [youtubeCreatingStream, setYoutubeCreatingStream] = useState(false);
	const [youtubeWatchUrl, setYoutubeWatchUrl] = useState<string | null>(null);
	const [youtubeStatus, setYoutubeStatus] = useState<string | null>(null);

	const destination = useMemo(
		() => ({ provider: "youtube" as const, isAuthenticated: youtubeAuthenticated }),
		[youtubeAuthenticated],
	);

	const refreshYouTubeAuthStatus = useCallback(async () => {
		try {
			const status = await window.electronAPI?.youtubeAuthStatus?.();
			setYoutubeAuthenticated(Boolean(status?.authenticated));
			return Boolean(status?.authenticated);
		} catch (authError) {
			setYoutubeAuthenticated(false);
			setError(authError instanceof Error ? authError.message : "Unable to check YouTube sign-in.");
			return false;
		}
	}, [setError]);

	const signInToYouTube = useCallback(async () => {
		setYoutubeAuthLoading(true);
		setError(null);
		try {
			const result = await window.electronAPI?.youtubeAuthStart?.();
			if (!result?.success) {
				const nextError = result?.error ?? "Unable to sign in with Google.";
				setError(nextError);
				setYoutubeAuthenticated(false);
				return false;
			}
			setYoutubeAuthenticated(true);
			return true;
		} catch (authError) {
			const nextError =
				authError instanceof Error ? authError.message : "Unable to sign in with Google.";
			setError(nextError);
			setYoutubeAuthenticated(false);
			return false;
		} finally {
			setYoutubeAuthLoading(false);
		}
	}, [setError]);

	const setYouTubeCreatingStream = useCallback((creatingStream: boolean) => {
		setYoutubeCreatingStream(creatingStream);
	}, []);

	const setYouTubeWatchUrl = useCallback((watchUrl: string | null) => {
		setYoutubeWatchUrl(watchUrl);
	}, []);

	const setYouTubeStatus = useCallback((status: string | null) => {
		setYoutubeStatus(status);
	}, []);

	return {
		destination,
		authenticated: youtubeAuthenticated,
		authLoading: youtubeAuthLoading,
		creatingStream: youtubeCreatingStream,
		watchUrl: youtubeWatchUrl,
		status: youtubeStatus,
		refreshAuthStatus: refreshYouTubeAuthStatus,
		signIn: signInToYouTube,
		setCreatingStream: setYouTubeCreatingStream,
		setWatchUrl: setYouTubeWatchUrl,
		setStatus: setYouTubeStatus,
	};
}

export function useLiveDestination() {
	const [provider, setProviderState] = useState<LiveStreamDestinationProvider>(
		() => loadLaunchPreferences().destinationProvider ?? "rtmp",
	);
	const [error, setError] = useState<string | null>(null);
	const rtmp = useRtmpDestinationState(setError);
	const youtube = useYouTubeDestinationState(setError);

	const activeDestination = useMemo<LiveStreamDestinationInput>(
		() => (provider === "youtube" ? youtube.destination : rtmp.destination),
		[provider, rtmp.destination, youtube.destination],
	);
	const isValid = useMemo(
		() => !validateLiveStreamDestination(activeDestination),
		[activeDestination],
	);

	const setProvider = useCallback(
		(nextProvider: LiveStreamDestinationProvider) => {
			setProviderState(nextProvider);
			saveLaunchPreferencesPatch({ destinationProvider: nextProvider });
			setError(null);
			if (nextProvider === "youtube") {
				void youtube.refreshAuthStatus();
			}
		},
		[youtube.refreshAuthStatus],
	);

	const validate = useCallback(() => {
		const validationError = validateLiveStreamDestination(activeDestination);
		setError(validationError);
		return !validationError;
	}, [activeDestination]);

	const prepareStart = useCallback(async () => {
		let nextDestination = activeDestination;
		if (provider === "youtube") {
			const authenticated = await youtube.refreshAuthStatus();
			nextDestination = { provider: "youtube", isAuthenticated: authenticated };
		}

		const validationError = validateLiveStreamDestination(nextDestination);
		setError(validationError);
		if (validationError) return null;

		if (provider === "youtube") {
			youtube.setCreatingStream(true);
			youtube.setWatchUrl(null);
			youtube.setStatus(null);
		}
		return nextDestination;
	}, [
		activeDestination,
		provider,
		youtube.refreshAuthStatus,
		youtube.setCreatingStream,
		youtube.setStatus,
		youtube.setWatchUrl,
	]);

	const finish = useCallback(() => {
		if (provider === "rtmp") {
			rtmp.clearStreamKey();
		}
		youtube.setCreatingStream(false);
		youtube.setStatus(null);
	}, [provider, rtmp.clearStreamKey, youtube.setCreatingStream, youtube.setStatus]);

	const cleanup = useCallback(() => {
		youtube.setCreatingStream(false);
		youtube.setStatus(null);
	}, [youtube.setCreatingStream, youtube.setStatus]);

	return {
		provider,
		setProvider,
		rtmp,
		youtube,
		error,
		isValid,
		validate,
		prepareStart,
		finish,
		cleanup,
		activeDestination,
	};
}
