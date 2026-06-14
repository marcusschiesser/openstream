import { createHash, randomBytes } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import path from "node:path";
import { URLSearchParams } from "node:url";
import { app, safeStorage, shell } from "electron";

const YOUTUBE_OAUTH_SCOPE = "https://www.googleapis.com/auth/youtube";
const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const YOUTUBE_API_BASE_URL = "https://www.googleapis.com/youtube/v3";
const TOKEN_FILE_NAME = "youtube-auth-token.json";
const OAUTH_TIMEOUT_MS = 120_000;

declare const __OPENSTREAM_YOUTUBE_CLIENT_ID__: string | undefined;
declare const __OPENSTREAM_YOUTUBE_CLIENT_SECRET__: string | undefined;

type StoredYouTubeToken = {
	accessToken?: string;
	refreshToken?: string;
	expiresAt?: number;
};

type PersistedToken = {
	encrypted: boolean;
	value: string;
};

type YouTubeTokenResponse = {
	access_token?: string;
	refresh_token?: string;
	expires_in?: number;
	error?: string;
	error_description?: string;
};

type YouTubeLiveStreamResponse = {
	id?: string;
	cdn?: {
		ingestionInfo?: {
			streamName?: string;
			ingestionAddress?: string;
			rtmpsIngestionAddress?: string;
		};
	};
};

type YouTubeLiveBroadcastResponse = {
	id?: string;
};

type YouTubeLiveBroadcastStatusResponse = {
	items?: Array<{
		status?: {
			lifeCycleStatus?: string;
		};
	}>;
};

export type YouTubeCreateLiveStreamResult = {
	broadcastId: string;
	streamId: string;
	watchUrl: string;
	ingestionUrl: string;
};

export type YouTubeBroadcastStatusResult = {
	lifeCycleStatus: string | null;
};

function getOAuthClientId(): string | null {
	return (
		process.env.OPENSTREAM_YOUTUBE_CLIENT_ID ??
		process.env.VITE_OPENSTREAM_YOUTUBE_CLIENT_ID ??
		process.env.YOUTUBE_CLIENT_ID ??
		(typeof __OPENSTREAM_YOUTUBE_CLIENT_ID__ === "undefined"
			? undefined
			: __OPENSTREAM_YOUTUBE_CLIENT_ID__) ??
		null
	);
}

function getOAuthClientSecret(): string | null {
	const configuredSecret =
		process.env.OPENSTREAM_YOUTUBE_CLIENT_SECRET ??
		process.env.VITE_OPENSTREAM_YOUTUBE_CLIENT_SECRET ??
		process.env.YOUTUBE_CLIENT_SECRET ??
		(typeof __OPENSTREAM_YOUTUBE_CLIENT_SECRET__ === "undefined"
			? undefined
			: __OPENSTREAM_YOUTUBE_CLIENT_SECRET__);
	return configuredSecret || null;
}

function appendOAuthClientSecret(params: URLSearchParams) {
	const clientSecret = getOAuthClientSecret();
	if (clientSecret) {
		params.set("client_secret", clientSecret);
	}
	return params;
}

function getTokenPath(): string {
	return path.join(app.getPath("userData"), TOKEN_FILE_NAME);
}

function encodeBase64Url(buffer: Buffer): string {
	return buffer.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function createPkcePair() {
	const verifier = encodeBase64Url(randomBytes(64));
	const challenge = encodeBase64Url(createHash("sha256").update(verifier).digest());
	return { verifier, challenge };
}

function readStoredToken(): StoredYouTubeToken | null {
	try {
		const raw = readFileSync(getTokenPath(), "utf8");
		const persisted = JSON.parse(raw) as PersistedToken;
		const serialized =
			persisted.encrypted && safeStorage.isEncryptionAvailable()
				? safeStorage.decryptString(Buffer.from(persisted.value, "base64"))
				: Buffer.from(persisted.value, "base64").toString("utf8");
		return JSON.parse(serialized) as StoredYouTubeToken;
	} catch {
		return null;
	}
}

function writeStoredToken(token: StoredYouTubeToken) {
	const serialized = JSON.stringify(token);
	const encrypted = safeStorage.isEncryptionAvailable();
	const value = encrypted
		? safeStorage.encryptString(serialized).toString("base64")
		: Buffer.from(serialized, "utf8").toString("base64");
	const persisted: PersistedToken = { encrypted, value };
	mkdirSync(path.dirname(getTokenPath()), { recursive: true });
	writeFileSync(getTokenPath(), JSON.stringify(persisted), "utf8");
}

async function parseJsonResponse<T>(response: Response): Promise<T> {
	const text = await response.text();
	const parsed = text ? JSON.parse(text) : {};
	if (!response.ok) {
		const message =
			typeof parsed?.error_description === "string"
				? parsed.error_description
				: typeof parsed?.error?.message === "string"
					? parsed.error.message
					: typeof parsed?.error === "string"
						? parsed.error
						: `YouTube API request failed with status ${response.status}.`;
		throw new Error(message);
	}
	return parsed as T;
}

async function exchangeToken(params: URLSearchParams): Promise<YouTubeTokenResponse> {
	const response = await fetch(GOOGLE_TOKEN_URL, {
		method: "POST",
		headers: { "Content-Type": "application/x-www-form-urlencoded" },
		body: params,
	});
	return parseJsonResponse<YouTubeTokenResponse>(response);
}

async function refreshAccessToken(token: StoredYouTubeToken): Promise<StoredYouTubeToken> {
	const clientId = getOAuthClientId();
	if (!clientId) {
		throw new Error("YouTube Live sign-in is not configured.");
	}
	if (!token.refreshToken) {
		throw new Error("Sign in with Google to stream to YouTube Live.");
	}

	const refreshed = await exchangeToken(
		appendOAuthClientSecret(
			new URLSearchParams({
				client_id: clientId,
				refresh_token: token.refreshToken,
				grant_type: "refresh_token",
			}),
		),
	);
	if (!refreshed.access_token) {
		throw new Error(refreshed.error_description ?? "Google did not return an access token.");
	}

	const nextToken = {
		...token,
		accessToken: refreshed.access_token,
		expiresAt: Date.now() + (refreshed.expires_in ?? 3600) * 1000,
	};
	writeStoredToken(nextToken);
	return nextToken;
}

async function getValidAccessToken(): Promise<string> {
	const token = readStoredToken();
	if (!token) {
		throw new Error("Sign in with Google to stream to YouTube Live.");
	}
	if (token.accessToken && token.expiresAt && token.expiresAt - Date.now() > 60_000) {
		return token.accessToken;
	}
	return (await refreshAccessToken(token)).accessToken!;
}

async function youtubeApi<T>(pathName: string, options: RequestInit = {}): Promise<T> {
	const accessToken = await getValidAccessToken();
	const response = await fetch(`${YOUTUBE_API_BASE_URL}${pathName}`, {
		...options,
		headers: {
			Authorization: `Bearer ${accessToken}`,
			"Content-Type": "application/json",
			...options.headers,
		},
	});
	return parseJsonResponse<T>(response);
}

function waitForOAuthCode(port: number, expectedState: string): Promise<string> {
	return new Promise((resolve, reject) => {
		let settled = false;
		let listening = false;
		const server = createServer((request, response) => {
			const url = new URL(request.url ?? "/", `http://127.0.0.1:${port}`);
			if (url.pathname !== "/oauth2callback") {
				response.writeHead(404);
				response.end("Not found.");
				return;
			}

			const error = url.searchParams.get("error");
			const state = url.searchParams.get("state");
			const code = url.searchParams.get("code");
			if (error) {
				response.writeHead(400, { "Content-Type": "text/html" });
				response.end("<html><body>Google sign-in was cancelled.</body></html>");
				cleanup();
				fail(new Error(error));
				return;
			}
			if (!code || state !== expectedState) {
				response.writeHead(400, { "Content-Type": "text/html" });
				response.end("<html><body>Invalid Google sign-in response.</body></html>");
				cleanup();
				fail(new Error("Invalid Google sign-in response."));
				return;
			}

			response.writeHead(200, { "Content-Type": "text/html" });
			response.end("<html><body>You can return to OpenStream.</body></html>");
			cleanup();
			succeed(code);
		});

		const timeout = setTimeout(() => {
			cleanup();
			fail(new Error("Timed out waiting for Google sign-in."));
		}, OAUTH_TIMEOUT_MS);

		function cleanup() {
			clearTimeout(timeout);
			if (listening) {
				server.close();
				listening = false;
			}
		}

		function fail(error: Error) {
			if (settled) return;
			settled = true;
			reject(error);
		}

		function succeed(code: string) {
			if (settled) return;
			settled = true;
			resolve(code);
		}

		server.once("error", (error: NodeJS.ErrnoException) => {
			cleanup();
			const message =
				error.code === "EADDRINUSE"
					? "Unable to start Google sign-in because the OAuth callback port is already in use."
					: `Unable to start Google sign-in callback server: ${error.message}`;
			fail(new Error(message));
		});

		server.listen(port, "127.0.0.1", () => {
			listening = true;
		});
	});
}

export function getYouTubeAuthStatus() {
	const token = readStoredToken();
	return {
		configured: Boolean(getOAuthClientId()),
		authenticated: Boolean(token?.refreshToken),
	};
}

export async function startYouTubeAuth() {
	const clientId = getOAuthClientId();
	if (!clientId) {
		throw new Error("YouTube Live sign-in is not configured.");
	}

	const { verifier, challenge } = createPkcePair();
	const state = encodeBase64Url(randomBytes(24));
	const port = 53987;
	const redirectUri = `http://127.0.0.1:${port}/oauth2callback`;
	const codePromise = waitForOAuthCode(port, state);
	const authParams = new URLSearchParams({
		client_id: clientId,
		redirect_uri: redirectUri,
		response_type: "code",
		scope: YOUTUBE_OAUTH_SCOPE,
		access_type: "offline",
		prompt: "consent",
		code_challenge: challenge,
		code_challenge_method: "S256",
		state,
	});

	await shell.openExternal(`${GOOGLE_AUTH_URL}?${authParams.toString()}`);
	const code = await codePromise;
	const token = await exchangeToken(
		appendOAuthClientSecret(
			new URLSearchParams({
				client_id: clientId,
				code,
				code_verifier: verifier,
				grant_type: "authorization_code",
				redirect_uri: redirectUri,
			}),
		),
	);

	if (!token.access_token || !token.refresh_token) {
		throw new Error(token.error_description ?? "Google did not return YouTube access tokens.");
	}

	writeStoredToken({
		accessToken: token.access_token,
		refreshToken: token.refresh_token,
		expiresAt: Date.now() + (token.expires_in ?? 3600) * 1000,
	});
}

export async function createYouTubeLiveStream(): Promise<YouTubeCreateLiveStreamResult> {
	const scheduledStartTime = new Date().toISOString();
	const title = `OpenStream Live ${new Date().toLocaleString(undefined, {
		year: "numeric",
		month: "2-digit",
		day: "2-digit",
		hour: "2-digit",
		minute: "2-digit",
	})}`;

	const broadcast = await youtubeApi<YouTubeLiveBroadcastResponse>(
		"/liveBroadcasts?part=snippet,contentDetails,status",
		{
			method: "POST",
			body: JSON.stringify({
				snippet: { title, scheduledStartTime },
				status: { privacyStatus: "unlisted", selfDeclaredMadeForKids: false },
				contentDetails: {
					enableAutoStart: true,
					enableAutoStop: true,
					monitorStream: { enableMonitorStream: false },
				},
			}),
		},
	);
	if (!broadcast.id) {
		throw new Error("YouTube did not return a broadcast ID.");
	}

	const stream = await youtubeApi<YouTubeLiveStreamResponse>(
		"/liveStreams?part=snippet,cdn,contentDetails",
		{
			method: "POST",
			body: JSON.stringify({
				snippet: { title },
				cdn: {
					ingestionType: "rtmp",
					resolution: "variable",
					frameRate: "variable",
				},
				contentDetails: { isReusable: false },
			}),
		},
	);
	const streamName = stream.cdn?.ingestionInfo?.streamName;
	const ingestionAddress =
		stream.cdn?.ingestionInfo?.ingestionAddress ?? stream.cdn?.ingestionInfo?.rtmpsIngestionAddress;
	if (!stream.id || !streamName || !ingestionAddress) {
		throw new Error("YouTube did not return stream ingestion details.");
	}

	await youtubeApi<YouTubeLiveBroadcastResponse>(
		`/liveBroadcasts/bind?id=${encodeURIComponent(broadcast.id)}&part=id,snippet,contentDetails,status&streamId=${encodeURIComponent(stream.id)}`,
		{ method: "POST" },
	);

	return {
		broadcastId: broadcast.id,
		streamId: stream.id,
		watchUrl: `https://www.youtube.com/watch?v=${encodeURIComponent(broadcast.id)}`,
		ingestionUrl: `${ingestionAddress.replace(/\/+$/, "")}/${streamName}`,
	};
}

export async function getYouTubeBroadcastStatus(input: {
	broadcastId: string;
}): Promise<YouTubeBroadcastStatusResult> {
	const broadcastStatus = await youtubeApi<YouTubeLiveBroadcastStatusResponse>(
		`/liveBroadcasts?part=status&id=${encodeURIComponent(input.broadcastId)}`,
	);
	const broadcast = broadcastStatus.items?.[0];
	return {
		lifeCycleStatus: broadcast?.status?.lifeCycleStatus ?? null,
	};
}
