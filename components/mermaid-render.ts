/**
 * The app's ONE mermaid renderer (the chrome-melt wave, 2026-09-19): both the
 * in-chat block (components/md-blocks.tsx) and the session-scoped focus
 * overlay (components/session-overlay.tsx) render charts through this module
 * — one dark-theme config, one plugin instance, unique render ids. This
 * REPLACES streamdown's internal mermaid path entirely: its fullscreen portal
 * was hard-wired `fixed inset-0` (covering the window-drag bar, X landing in
 * drag territory) with no styling hook, which is what drove the custom
 * component in the first place.
 */

import { createMermaidPlugin } from "@streamdown/mermaid";
import type { MermaidConfig } from "mermaid";

/** The chart's base font size (px) — mermaid sizes ALL text relative to
 *  this, so it's the number the display-width cap (md-blocks) divides by:
 *  a chart shown at its natural width renders text at exactly this size.
 *  Pinned explicitly so a mermaid default change can't silently shift the
 *  cap (owner rule, chrome-melt tweaks wave, 2026-09-19: chart text must
 *  never render larger than the session's own text). */
export const MERMAID_FONT_SIZE = 16;

// Kept as the dark baseline for existing callers and exported test fixtures.
export const mermaidTheme: MermaidConfig = {
	fontFamily: "ui-sans-serif, system-ui, sans-serif",
	fontSize: MERMAID_FONT_SIZE,
	securityLevel: "strict",
	theme: "dark",
};

const plugin = createMermaidPlugin();
let renderQueue: Promise<unknown> = Promise.resolve();

export function mermaidThemeFor(mode: "light" | "dark"): MermaidConfig {
	if (mode === "dark") return mermaidTheme;
	return {
		...mermaidTheme,
		theme: "base",
		themeVariables: {
			background: "#f6f3ec",
			primaryColor: "#e6eade",
			primaryTextColor: "#262b28",
			primaryBorderColor: "#597563",
			lineColor: "#62685e",
			secondaryColor: "#eeeae1",
			tertiaryColor: "#fffdf8",
		},
	};
}

/** Render one chart source to an svg string. The id is unique per call —
 *  mermaid caches rendered ids, and a repeated id across charts/renders
 *  returns the stale svg (the bug streamdown's own id minting avoids). */
export function renderMermaid(chart: string, mode: "light" | "dark" = "dark"): Promise<string> {
	// Mermaid's configuration is global. Serialize initialization and render
	// so a theme switch cannot recolor another chart that is still rendering.
	const render = renderQueue.then(async () => {
		const id = `lh-mermaid-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
		const { svg } = await plugin.getMermaid(mermaidThemeFor(mode)).render(id, chart);
		return svg;
	});
	renderQueue = render.catch(() => {});
	return render;
}
