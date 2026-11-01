"use client";

import { useSyncExternalStore } from "react";

const query = "(max-width: 767px)";
const subscribe = (notify: () => void) => {
	const media = window.matchMedia(query);
	media.addEventListener("change", notify);
	return () => media.removeEventListener("change", notify);
};

/** SSR and first hydration agree; later resizes follow the CSS breakpoint. */
export function useMobileLayout() {
	return useSyncExternalStore(subscribe, () => window.matchMedia(query).matches, () => false);
}
