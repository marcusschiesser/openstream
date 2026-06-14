import { Check, Copy, RadioTower, Youtube } from "lucide-react";
import { type KeyboardEvent as ReactKeyboardEvent, useState } from "react";
import { toast } from "sonner";
import type { LiveStreamDestinationProvider } from "@/lib/liveStream";
import { useHudPillExpansion } from "../../hooks/useHudPillExpansion";
import { Input } from "../ui/input";
import { HudControlPill } from "./HudControlPill";

type RtmpDestinationState = {
	serverUrl: string;
	streamKey: string;
	setServerUrl: (serverUrl: string) => void;
	setStreamKey: (streamKey: string) => void;
};

type YouTubeDestinationState = {
	authenticated: boolean;
	authLoading: boolean;
	creatingStream: boolean;
	watchUrl: string | null;
	status: string | null;
	signIn: () => Promise<boolean>;
};

type DestinationPillProps = {
	destination: {
		provider: LiveStreamDestinationProvider;
		setProvider: (provider: LiveStreamDestinationProvider) => void;
		rtmp: RtmpDestinationState;
		youtube: YouTubeDestinationState;
		error: string | null;
	};
	forceExpanded?: boolean;
	isStreaming?: boolean;
	readOnly?: boolean;
	onExpandedChange?: (expanded: boolean) => void;
	onRequestInteraction: () => void;
};

function getYouTubeLabels(youtube: YouTubeDestinationState, isStreaming: boolean) {
	const urlLabel =
		youtube.watchUrl && !isStreaming ? `Last stream: ${youtube.watchUrl}` : youtube.watchUrl;
	const statusLabel = youtube.status ? `YouTube: ${youtube.status}` : null;
	const pendingLabel = "Waiting for YouTube to be ready...";
	const readOnlyLabel = youtube.creatingStream
		? pendingLabel
		: (statusLabel ?? urlLabel ?? "YouTube Live");

	return { pendingLabel, readOnlyLabel, statusLabel, urlLabel };
}

function RtmpDestinationControls({
	rtmp,
	readOnly,
	onCollapseToReadOnly,
}: {
	rtmp: RtmpDestinationState;
	readOnly: boolean;
	onCollapseToReadOnly: (event: ReactKeyboardEvent<HTMLInputElement>) => void;
}) {
	return (
		<div className="flex min-w-0 items-center gap-2">
			<Input
				id="hud-rtmp-server-url"
				aria-label="Server URL"
				value={rtmp.serverUrl}
				onChange={(event) => rtmp.setServerUrl(event.target.value)}
				onKeyDown={onCollapseToReadOnly}
				disabled={readOnly}
				placeholder="rtmp://a.rtmp.youtube.com/live2"
				className="h-7 min-w-0 flex-[1.5] border-white/10 bg-white/[0.04] text-[11px] text-white placeholder:text-white/25"
			/>
			<Input
				id="hud-rtmp-stream-key"
				aria-label="Stream key"
				value={rtmp.streamKey}
				onChange={(event) => rtmp.setStreamKey(event.target.value)}
				onKeyDown={onCollapseToReadOnly}
				type="password"
				disabled={readOnly}
				placeholder="Stream key"
				className="h-7 min-w-0 flex-1 border-white/10 bg-white/[0.04] text-[11px] text-white placeholder:text-white/25"
			/>
		</div>
	);
}

function YouTubeDestinationControls({
	youtube,
	readOnly,
	copied,
	onCopyUrl,
	isStreaming,
}: {
	youtube: YouTubeDestinationState;
	readOnly: boolean;
	copied: boolean;
	onCopyUrl: () => void;
	isStreaming: boolean;
}) {
	const { pendingLabel, statusLabel, urlLabel } = getYouTubeLabels(youtube, isStreaming);

	return (
		<div className="flex min-w-0 items-center gap-2">
			{youtube.authenticated ? (
				<div className="min-w-0 flex-1 text-[11px] text-white/70">
					<div className="truncate">
						{statusLabel ??
							urlLabel ??
							(youtube.creatingStream ? pendingLabel : "Signed in with Google")}
					</div>
					{statusLabel && urlLabel && (
						<div className="truncate text-[10px] text-white/45">{urlLabel}</div>
					)}
					{youtube.creatingStream && urlLabel && (
						<div className="truncate text-[10px] text-white/45">{pendingLabel}</div>
					)}
				</div>
			) : (
				<button
					type="button"
					onClick={() => void youtube.signIn()}
					disabled={readOnly || youtube.authLoading}
					className="h-7 shrink-0 rounded border border-white/10 bg-white/[0.06] px-2 text-[11px] font-medium text-white hover:bg-white/10 disabled:cursor-wait disabled:opacity-60"
				>
					{youtube.authLoading ? "Signing in..." : "Sign in with Google"}
				</button>
			)}
			{youtube.watchUrl && (
				<button
					type="button"
					aria-label="Copy YouTube live URL"
					onClick={onCopyUrl}
					className="flex h-7 w-7 shrink-0 items-center justify-center rounded border border-white/10 bg-white/[0.06] text-white/70 hover:bg-white/10 hover:text-white"
				>
					{copied ? <Check size={14} /> : <Copy size={14} />}
				</button>
			)}
		</div>
	);
}

export function DestinationPill({
	destination,
	forceExpanded = false,
	isStreaming = false,
	readOnly = false,
	onExpandedChange,
	onRequestInteraction,
}: DestinationPillProps) {
	const [copied, setCopied] = useState(false);
	const expansion = useHudPillExpansion({
		forceExpanded: forceExpanded || Boolean(destination.error),
		onExpandedChange,
		onInteract: onRequestInteraction,
	});

	const collapseToReadOnly = (event: ReactKeyboardEvent<HTMLInputElement>) => {
		if (event.key !== "Enter") return;
		event.preventDefault();
		event.stopPropagation();
		expansion.collapse();
	};

	const copyYouTubeUrl = async () => {
		if (!destination.youtube.watchUrl) return;
		const result = await window.electronAPI.copyToClipboard(destination.youtube.watchUrl);
		if (!result.success) {
			toast.error(result.error ?? "Unable to copy YouTube live URL.");
			return;
		}
		setCopied(true);
		window.setTimeout(() => setCopied(false), 1400);
	};

	const readOnlyLabel =
		destination.provider === "youtube"
			? getYouTubeLabels(destination.youtube, isStreaming).readOnlyLabel
			: destination.rtmp.serverUrl || "Destination";

	return (
		<HudControlPill
			controller={expansion}
			size="destination"
			className="h-auto min-h-9"
			onPointerDown={(event) => event.stopPropagation()}
		>
			<RadioTower
				size={16}
				className={destination.error ? "shrink-0 text-amber-200" : "shrink-0 text-white/70"}
			/>
			{!expansion.expanded ? (
				<div className="min-w-0 flex-1 truncate text-[10px] font-medium text-white/60">
					{readOnlyLabel}
				</div>
			) : (
				<div className="flex min-w-0 flex-1 flex-col gap-1.5">
					<div className="flex min-w-0 items-center gap-1 rounded-md bg-white/[0.04] p-0.5">
						{(["rtmp", "youtube"] as const).map((provider) => (
							<button
								key={provider}
								type="button"
								aria-pressed={destination.provider === provider}
								disabled={readOnly}
								onClick={() => {
									if (!readOnly) destination.setProvider(provider);
								}}
								className={`flex h-6 min-w-0 flex-1 items-center justify-center gap-1 rounded px-2 text-[10px] font-medium transition ${
									destination.provider === provider
										? "bg-white/15 text-white"
										: "text-white/55 hover:bg-white/10 hover:text-white/80"
								} disabled:cursor-not-allowed disabled:opacity-60`}
							>
								{provider === "youtube" ? <Youtube size={12} /> : <RadioTower size={12} />}
								<span>{provider === "youtube" ? "YouTube Live" : "RTMP"}</span>
							</button>
						))}
					</div>
					{destination.provider === "rtmp" ? (
						<RtmpDestinationControls
							rtmp={destination.rtmp}
							readOnly={readOnly}
							onCollapseToReadOnly={collapseToReadOnly}
						/>
					) : (
						<YouTubeDestinationControls
							youtube={destination.youtube}
							readOnly={readOnly}
							copied={copied}
							onCopyUrl={() => void copyYouTubeUrl()}
							isStreaming={isStreaming}
						/>
					)}
					{destination.error && (
						<div className="truncate text-[10px] text-red-200">{destination.error}</div>
					)}
				</div>
			)}
		</HudControlPill>
	);
}
