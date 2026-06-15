import { MdMic } from "react-icons/md";
import { useHudPillExpansion } from "../../hooks/useHudPillExpansion";
import { AudioLevelMeter } from "../ui/audio-level-meter";
import { HudControlPill } from "./HudControlPill";
import { HudSelect } from "./HudSelect";

type AudioDeviceOption = {
	deviceId: string;
	label: string;
};

type MicPillProps = {
	microphone: {
		devices: AudioDeviceOption[];
		level: number;
		selectedDeviceId: string | undefined;
		selectedLabel: string;
		setDeviceId: (deviceId: string) => void;
	};
	onExpandedChange?: (expanded: boolean) => void;
	onRequestInteraction: () => void;
};

export function MicPill({ microphone, onExpandedChange, onRequestInteraction }: MicPillProps) {
	const controller = useHudPillExpansion({
		onExpandedChange,
		onInteract: onRequestInteraction,
	});

	return (
		<HudControlPill controller={controller} size="mic">
			<MdMic size={16} className="shrink-0 text-white/70" />
			<div className="relative flex-1 min-w-0">
				{!controller.expanded && (
					<div className="truncate text-[10px] font-medium text-white/60">
						{microphone.selectedLabel}
					</div>
				)}
				{controller.expanded && (
					<HudSelect
						controller={controller}
						label="Microphone source"
						value={microphone.selectedDeviceId}
						options={microphone.devices.map((device) => ({
							label: device.label,
							value: device.deviceId,
						}))}
						onValueChange={microphone.setDeviceId}
					/>
				)}
			</div>
			<AudioLevelMeter
				level={microphone.level}
				className={`${controller.expanded ? "w-16" : "w-8"} h-2`}
			/>
		</HudControlPill>
	);
}
