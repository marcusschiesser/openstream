import { useScopedT } from "@/contexts/I18nContext";
import { useHudPillExpansion } from "../../hooks/useHudPillExpansion";
import type { WebcamMaskShape } from "../../lib/liveLayoutTypes";
import { HudControlPill } from "./HudControlPill";
import { HudSelect } from "./HudSelect";

type CameraDeviceOption = {
	deviceId: string;
	label: string;
};

type WebcamPillProps = {
	webcam: {
		devices: CameraDeviceOption[];
		error: string | null;
		isLoading: boolean;
		selectedDeviceId: string | undefined;
		selectedLabel: string;
		setDeviceId: (deviceId: string) => void;
	};
	layout: {
		shape: WebcamMaskShape;
		shapeOptions: Array<{ value: WebcamMaskShape; label: string }>;
		size: number;
		sizeOptions: Array<{ value: number; label: string }>;
		setShape: (shape: WebcamMaskShape) => void;
		setSize: (size: number) => void;
	};
	onExpandedChange?: (expanded: boolean) => void;
	onRequestInteraction: () => void;
};

export function WebcamPill({
	webcam,
	layout,
	onExpandedChange,
	onRequestInteraction,
}: WebcamPillProps) {
	const t = useScopedT("launch");
	const controller = useHudPillExpansion({
		onExpandedChange,
		onInteract: onRequestInteraction,
	});

	return (
		<HudControlPill controller={controller} size="webcam">
			{!controller.expanded && (
				<div className="min-w-0 flex-1 truncate text-[10px] font-medium text-white/60">
					{webcam.selectedLabel}
				</div>
			)}
			{controller.expanded &&
				(webcam.isLoading ? (
					<span className="text-[10px] italic text-white/40">{t("webcam.searching")}</span>
				) : webcam.error ? (
					<span className="text-[10px] italic text-white/40">{t("webcam.unavailable")}</span>
				) : webcam.devices.length === 0 ? (
					<span className="text-[10px] italic text-white/40">{t("webcam.noneFound")}</span>
				) : (
					<>
						<HudSelect
							controller={controller}
							label="Webcam source"
							value={webcam.selectedDeviceId}
							options={webcam.devices.map((device) => ({
								label: device.label,
								value: device.deviceId,
							}))}
							onValueChange={webcam.setDeviceId}
						/>
						<HudSelect
							controller={controller}
							label="Webcam shape"
							value={layout.shape}
							options={layout.shapeOptions}
							onValueChange={(value) => layout.setShape(value as WebcamMaskShape)}
							width={104}
						/>
						<HudSelect
							controller={controller}
							label="Webcam size"
							value={layout.size}
							options={layout.sizeOptions}
							onValueChange={(value) => layout.setSize(Number(value))}
							width={78}
						/>
					</>
				))}
		</HudControlPill>
	);
}
