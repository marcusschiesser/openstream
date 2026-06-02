import { useEffect, useState } from "react";
import { LaunchWindow } from "./components/launch/LaunchWindow";
import { SourceSelector } from "./components/launch/SourceSelector";
import { Toaster } from "./components/ui/sonner";
import { TooltipProvider } from "./components/ui/tooltip";

export default function App() {
	const [windowType, setWindowType] = useState(
		() => new URLSearchParams(window.location.search).get("windowType") || "hud-overlay",
	);

	useEffect(() => {
		const type = new URLSearchParams(window.location.search).get("windowType") || "hud-overlay";
		if (type !== windowType) {
			setWindowType(type);
		}

		if (type === "hud-overlay" || type === "source-selector") {
			document.body.style.background = "transparent";
			document.documentElement.style.background = "transparent";
			document.getElementById("root")?.style.setProperty("background", "transparent");
		}

		if (type === "hud-overlay") {
			document.documentElement.style.height = "100%";
			document.documentElement.style.overflow = "hidden";
			document.body.style.height = "100%";
			document.body.style.margin = "0";
			document.body.style.overflow = "hidden";
			const root = document.getElementById("root");
			root?.style.setProperty("height", "100%");
			root?.style.setProperty("min-height", "0");
			root?.style.setProperty("overflow", "hidden");
		}
	}, [windowType]);

	const content =
		windowType === "source-selector" ? (
			<SourceSelector />
		) : windowType === "hud-overlay" ? (
			<LaunchWindow />
		) : (
			<div className="flex h-full w-full items-center justify-center bg-[#07080a] text-white">
				OpenStream
			</div>
		);

	return (
		<TooltipProvider>
			{content}
			<Toaster theme="dark" className="pointer-events-auto" />
		</TooltipProvider>
	);
}
