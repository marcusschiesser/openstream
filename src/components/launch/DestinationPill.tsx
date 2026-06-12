import { RadioTower } from "lucide-react";
import { type KeyboardEvent as ReactKeyboardEvent } from "react";
import { useHudPillExpansion } from "../../hooks/useHudPillExpansion";
import { Input } from "../ui/input";
import { HudControlPill } from "./HudControlPill";

type DestinationPillProps = {
	destination: {
		serverUrl: string;
		streamKey: string;
		error: string | null;
		setServerUrl: (serverUrl: string) => void;
		setStreamKey: (streamKey: string) => void;
	};
	forceExpanded?: boolean;
	onExpandedChange?: (expanded: boolean) => void;
	onRequestInteraction: () => void;
};

export function DestinationPill({
	destination,
	forceExpanded = false,
	onExpandedChange,
	onRequestInteraction,
}: DestinationPillProps) {
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
					{destination.serverUrl || "Destination"}
				</div>
			) : (
				<div className="flex min-w-0 flex-1 flex-col gap-1.5">
					<div className="flex min-w-0 items-center gap-2">
						<Input
							id="hud-rtmp-server-url"
							aria-label="Server URL"
							value={destination.serverUrl}
							onChange={(event) => destination.setServerUrl(event.target.value)}
							onKeyDown={collapseToReadOnly}
							placeholder="rtmp://a.rtmp.youtube.com/live2"
							className="h-7 min-w-0 flex-[1.5] border-white/10 bg-white/[0.04] text-[11px] text-white placeholder:text-white/25"
						/>
						<Input
							id="hud-rtmp-stream-key"
							aria-label="Stream key"
							value={destination.streamKey}
							onChange={(event) => destination.setStreamKey(event.target.value)}
							onKeyDown={collapseToReadOnly}
							type="password"
							placeholder="Stream key"
							className="h-7 min-w-0 flex-1 border-white/10 bg-white/[0.04] text-[11px] text-white placeholder:text-white/25"
						/>
					</div>
					{destination.error && (
						<div className="truncate text-[10px] text-red-200">{destination.error}</div>
					)}
				</div>
			)}
		</HudControlPill>
	);
}
