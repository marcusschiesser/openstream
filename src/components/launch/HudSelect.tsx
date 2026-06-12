import { ChevronDown } from "lucide-react";
import type { HudPillController } from "../../hooks/useHudPillExpansion";

type HudSelectOption = {
	label: string;
	value: number | string;
};

type HudSelectProps = {
	controller: HudPillController;
	label: string;
	onValueChange: (value: string) => void;
	options: HudSelectOption[];
	value: string | number | undefined;
	width?: number;
};

export function HudSelect({
	controller,
	label,
	onValueChange,
	options,
	value,
	width,
}: HudSelectProps) {
	return (
		<div className={width ? "relative shrink-0" : "relative min-w-0 flex-1"} style={{ width }}>
			<select
				aria-label={label}
				value={value}
				onChange={(event) => {
					onValueChange(event.target.value);
					controller.collapse();
					event.currentTarget.blur();
				}}
				className="w-full appearance-none rounded-lg border border-white/10 bg-white/5 py-1 pl-2 pr-6 text-[11px] text-white outline-none hover:bg-white/10"
			>
				{options.map((option) => (
					<option key={option.value} value={option.value} className="bg-[#1c1c24]">
						{option.label}
					</option>
				))}
			</select>
			<ChevronDown
				size={12}
				className="pointer-events-none absolute right-1.5 top-1/2 -translate-y-1/2 text-white/40"
			/>
		</div>
	);
}
