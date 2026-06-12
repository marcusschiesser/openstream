import {
	type PointerEvent as ReactPointerEvent,
	type RefObject,
	useCallback,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";

type UseHudPillExpansionOptions = {
	forceExpanded?: boolean;
	leaveDelayMs?: number;
	onExpandedChange?: (expanded: boolean) => void;
	onInteract?: () => void;
};

export type HudPillController = {
	collapse: () => void;
	expanded: boolean;
	handleBlur: () => void;
	handleFocus: () => void;
	handleMouseEnter: () => void;
	handleMouseLeave: () => void;
	handlePointerMove: (event: ReactPointerEvent) => void;
	rootRef: RefObject<HTMLDivElement | null>;
};

export function useHudPillExpansion({
	forceExpanded = false,
	leaveDelayMs = 120,
	onExpandedChange,
	onInteract,
}: UseHudPillExpansionOptions = {}) {
	const rootRef = useRef<HTMLDivElement | null>(null);
	const leaveTimeoutRef = useRef<number | null>(null);
	const [isHovered, setIsHovered] = useState(false);
	const [isFocused, setIsFocused] = useState(false);
	const [collapsedUntilPointerMove, setCollapsedUntilPointerMove] = useState(false);
	const expanded = forceExpanded || (!collapsedUntilPointerMove && (isHovered || isFocused));

	const clearLeaveTimeout = useCallback(() => {
		if (leaveTimeoutRef.current !== null) {
			window.clearTimeout(leaveTimeoutRef.current);
			leaveTimeoutRef.current = null;
		}
	}, []);

	const blurActiveElement = useCallback(() => {
		const activeElement = document.activeElement;
		if (
			activeElement instanceof HTMLElement &&
			(!rootRef.current || rootRef.current.contains(activeElement))
		) {
			activeElement.blur();
		}
	}, []);

	const collapse = useCallback(() => {
		clearLeaveTimeout();
		blurActiveElement();
		setIsHovered(false);
		setIsFocused(false);
		setCollapsedUntilPointerMove(true);
	}, [blurActiveElement, clearLeaveTimeout]);

	const handlePointerMove = useCallback(
		(event: ReactPointerEvent) => {
			if (collapsedUntilPointerMove && event.movementX === 0 && event.movementY === 0) {
				// Ignore synthetic zero-delta moves so an explicitly collapsed pill stays readonly.
				onInteract?.();
				return;
			}
			clearLeaveTimeout();
			setCollapsedUntilPointerMove(false);
			setIsHovered(true);
			onInteract?.();
		},
		[clearLeaveTimeout, collapsedUntilPointerMove, onInteract],
	);

	const handleMouseEnter = useCallback(() => {
		onInteract?.();
	}, [onInteract]);

	const handleMouseLeave = useCallback(() => {
		clearLeaveTimeout();
		leaveTimeoutRef.current = window.setTimeout(() => {
			blurActiveElement();
			setIsHovered(false);
			setIsFocused(false);
			leaveTimeoutRef.current = null;
		}, leaveDelayMs);
	}, [blurActiveElement, clearLeaveTimeout, leaveDelayMs]);

	const handleFocus = useCallback(() => {
		setCollapsedUntilPointerMove(false);
		setIsFocused(true);
	}, []);

	const handleBlur = useCallback(() => {
		setIsFocused(false);
	}, []);

	useEffect(() => {
		return clearLeaveTimeout;
	}, [clearLeaveTimeout]);

	useEffect(() => {
		onExpandedChange?.(expanded);
		return () => onExpandedChange?.(false);
	}, [expanded, onExpandedChange]);

	return useMemo<HudPillController>(
		() => ({
			collapse,
			expanded,
			handleBlur,
			handleFocus,
			handleMouseEnter,
			handleMouseLeave,
			handlePointerMove,
			rootRef,
		}),
		[
			collapse,
			expanded,
			handleBlur,
			handleFocus,
			handleMouseEnter,
			handleMouseLeave,
			handlePointerMove,
		],
	);
}
