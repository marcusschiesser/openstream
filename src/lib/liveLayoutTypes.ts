import type { WebcamLayoutPreset } from "@/lib/compositeLayout";

export type { WebcamLayoutPreset };

export type WebcamSizePreset = number;

export type WebcamMaskShape = "rectangle" | "circle" | "square" | "rounded";

export interface WebcamPosition {
	cx: number;
	cy: number;
}
