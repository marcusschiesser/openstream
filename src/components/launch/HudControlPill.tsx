import { type PointerEventHandler, type ReactNode, type Ref } from "react";
import type { HudPillController } from "../../hooks/useHudPillExpansion";
import styles from "./LaunchWindow.module.css";

const HUD_PILL_SIZES = {
	destination: { collapsed: 240, expanded: 520 },
	mic: { collapsed: 140, expanded: 240 },
	webcam: { collapsed: 140, expanded: 430 },
} as const;

type HudControlPillProps = {
	children: ReactNode;
	className?: string;
	controller: HudPillController;
	onPointerDown?: PointerEventHandler<HTMLDivElement>;
	size: keyof typeof HUD_PILL_SIZES;
};

export function HudControlPill({
	children,
	className = "",
	controller,
	onPointerDown,
	size,
}: HudControlPillProps) {
	const width = HUD_PILL_SIZES[size];
	return (
		<div
			ref={controller.rootRef as Ref<HTMLDivElement>}
			data-hud-interactive="true"
			className={`flex h-9 items-center gap-2 overflow-hidden rounded-xl border border-white/[0.08] bg-[#0b0c10]/90 px-3 py-1.5 text-white shadow-[0_18px_42px_rgba(0,0,0,0.4)] backdrop-blur-2xl transition-[opacity,filter,background-color] duration-150 ${!controller.expanded ? "opacity-60 grayscale-[0.5]" : "opacity-100"} ${styles.electronNoDrag} ${className}`}
			style={{ width: controller.expanded ? width.expanded : width.collapsed }}
			onPointerDown={onPointerDown}
			onPointerMove={controller.handlePointerMove}
			onMouseEnter={controller.handleMouseEnter}
			onMouseLeave={controller.handleMouseLeave}
			onFocus={controller.handleFocus}
			onBlur={controller.handleBlur}
		>
			{children}
		</div>
	);
}
