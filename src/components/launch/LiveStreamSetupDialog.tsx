import { Radio, RadioTower } from "lucide-react";
import { type CSSProperties, useEffect, useState } from "react";
import { type LiveStreamLayout, validateLiveStreamDestination } from "@/lib/liveStream";
import { Button } from "../ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "../ui/dialog";
import { Input } from "../ui/input";

type LiveStreamSetupDialogProps = {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	selectedSource: ProcessedDesktopSource | null;
	layout: LiveStreamLayout;
	onStart: (input: {
		serverUrl: string;
		streamKey: string;
		layout: LiveStreamLayout;
	}) => Promise<boolean>;
};

const DEFAULT_STREAM_SERVER_URL = "rtmp://a.rtmp.youtube.com/live2";
const START_CAPTURE_DELAY_MS = 220;

function delay(ms: number): Promise<void> {
	return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function formatDestinationPreview(serverUrl: string, streamKey: string) {
	const normalizedServerUrl = serverUrl.trim().replace(/\/+$/, "");
	const normalizedStreamKey = streamKey.trim();
	if (!normalizedServerUrl || !normalizedStreamKey) {
		return "rtmp(s)://...";
	}

	const visibleSuffix = normalizedStreamKey.slice(-4);
	return `${normalizedServerUrl}/****${visibleSuffix ? `-${visibleSuffix}` : ""}`;
}

export function LiveStreamSetupDialog({
	open,
	onOpenChange,
	selectedSource,
	layout,
	onStart,
}: LiveStreamSetupDialogProps) {
	const [serverUrl, setServerUrl] = useState(DEFAULT_STREAM_SERVER_URL);
	const [streamKey, setStreamKey] = useState("");
	const [error, setError] = useState<string | null>(null);
	const [starting, setStarting] = useState(false);

	useEffect(() => {
		if (!open) {
			setError(null);
			setStarting(false);
		}
	}, [open]);

	const handleStart = async () => {
		const validationError = validateLiveStreamDestination({ serverUrl, streamKey });
		if (validationError) {
			setError(validationError);
			return;
		}

		setError(null);
		setStarting(true);
		onOpenChange(false);
		await delay(START_CAPTURE_DELAY_MS);
		const started = await onStart({ serverUrl, streamKey, layout });
		if (!started) {
			onOpenChange(true);
		}
		setStarting(false);
	};

	const destinationPreview = formatDestinationPreview(serverUrl, streamKey);

	return (
		<Dialog open={open} onOpenChange={(nextOpen) => !starting && onOpenChange(nextOpen)}>
			<DialogContent
				data-hud-interactive="true"
				className="flex w-[calc(100vw-24px)] max-w-[420px] grid-rows-none flex-col gap-0 overflow-hidden border-white/10 bg-[#0b0c10] p-0 text-white"
				style={{ WebkitAppRegion: "no-drag" } as CSSProperties}
				onPointerMove={(event) => event.stopPropagation()}
				onPointerDown={(event) => event.stopPropagation()}
			>
				<DialogHeader className="shrink-0 border-b border-white/10 px-5 py-3">
					<div className="flex items-center gap-2">
						<div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500/15 text-emerald-300">
							<RadioTower size={17} />
						</div>
						<div>
							<DialogTitle className="text-base">Stream Setup</DialogTitle>
							<DialogDescription className="text-xs text-white/50">
								Enter your live destination before going live.
							</DialogDescription>
						</div>
					</div>
				</DialogHeader>

				<div className="min-w-0 space-y-3 p-4">
					<div className="space-y-1.5">
						<label className="text-[11px] font-medium text-white/70" htmlFor="rtmps-server-url">
							Server URL
						</label>
						<Input
							id="rtmps-server-url"
							value={serverUrl}
							onChange={(event) => setServerUrl(event.target.value)}
							placeholder="rtmp://a.rtmp.youtube.com/live2"
							className="h-9 border-white/10 bg-white/[0.04] text-xs text-white placeholder:text-white/25"
						/>
					</div>
					<div className="space-y-1.5">
						<label className="text-[11px] font-medium text-white/70" htmlFor="rtmps-stream-key">
							Stream key
						</label>
						<Input
							id="rtmps-stream-key"
							value={streamKey}
							onChange={(event) => setStreamKey(event.target.value)}
							type="password"
							placeholder="Stream key"
							className="h-9 border-white/10 bg-white/[0.04] text-xs text-white placeholder:text-white/25"
						/>
					</div>
					<div className="truncate rounded-lg border border-white/10 bg-white/[0.03] px-2.5 py-2 text-[10px] text-white/35">
						{destinationPreview}
					</div>

					{error && (
						<div className="rounded-lg border border-red-500/25 bg-red-500/10 px-2.5 py-2 text-[11px] text-red-200">
							{error}
						</div>
					)}
				</div>

				<DialogFooter className="shrink-0 border-t border-white/10 px-5 py-3">
					<Button
						type="button"
						variant="ghost"
						disabled={starting}
						onClick={() => onOpenChange(false)}
						className="h-8 text-xs text-white/65 hover:bg-white/10 hover:text-white"
					>
						Cancel
					</Button>
					<Button
						type="button"
						disabled={starting || !selectedSource}
						onClick={handleStart}
						className="h-8 gap-2 bg-emerald-500 px-4 text-xs font-semibold text-white hover:bg-emerald-500/85"
					>
						<Radio size={14} />
						{starting ? "Starting..." : "Go Live"}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
