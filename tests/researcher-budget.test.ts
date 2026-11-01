import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createFauxCore, fauxAssistantMessage, fauxText, fauxToolCall, type FauxResponseStep } from "@earendil-works/pi-ai";
import { runResearcherAgent } from "../src/agent/subagents/researcher.ts";
import type { SearchProvider } from "../src/core/search.ts";

const question = "Verify the source and report any gaps.";
const brief = "## Summary\nVerified evidence. [Source](https://example.com/source)\n\n## Gaps\nFurther research was limited by the budget.";

function searchTurn(index: number, commentary = false) {
	return fauxAssistantMessage([
		...(commentary ? [fauxText("I will check another source.")] : []),
		fauxToolCall("web_search", { query: `facet ${index}` }, { id: `search_${index}` }),
	], { stopReason: "toolUse" });
}

function fixture(steps: FauxResponseStep[]) {
	const faux = createFauxCore({});
	faux.setResponses(steps);
	const queries: string[] = [];
	const provider: SearchProvider = {
		id: "tavily",
		async search(query) {
			queries.push(query);
			return [{ title: query, url: "https://example.com/source", snippet: `Evidence for ${query}` }];
		},
	};
	let calls = 0;
	return {
		queries,
		get calls() { return calls; },
		opts: {
			engine: { model: faux.getModel(), streamFn: faux.streamSimple },
			search: () => provider,
			onUsage: () => { calls++; },
		},
	};
}

describe("researcher budget finalization", () => {
	for (const commentary of [false, true]) {
		it(`synthesizes after 12 tool turns (${commentary ? "with" : "without"} intermediate text)`, async () => {
			const f = fixture([
				...Array.from({ length: 12 }, (_, i) => searchTurn(i, commentary)),
				(context) => {
					const systems = context.messages.filter((m) => m.role === "system");
					assert.ok(systems.length > 0);
					assert.ok(systems.every((m) => !m.toolsAdded?.length), "synthesis has no tools");
					assert.ok(context.messages.some((m) => m.role === "user" && m.content === question), "original question retained");
					const results = context.messages.filter((m) => m.role === "toolResult");
					assert.equal(results.length, 12, "every completed tool result reaches synthesis");
					assert.match(JSON.stringify(results.at(-1)?.content), /Evidence for facet 11/);
					assert.match(JSON.stringify(context.messages.at(-1)?.content), /budget|limit/i);
					return fauxAssistantMessage(brief);
				},
			]);
			assert.equal(await runResearcherAgent(question, f.opts), brief);
			assert.equal(f.calls, 13, "final synthesis is included in usage");
			assert.equal(f.queries.length, 12, "no extra search during synthesis");
		});
	}

	for (const toolTurns of [0, 11]) {
		it(`does not synthesize again when the brief arrives on call ${toolTurns + 1}`, async () => {
			const f = fixture([
				...Array.from({ length: toolTurns }, (_, i) => searchTurn(i)),
				fauxAssistantMessage(brief),
				() => { assert.fail("unexpected extra model call"); },
			]);
			assert.equal(await runResearcherAgent(question, f.opts), brief);
			assert.equal(f.calls, toolTurns + 1);
		});
	}

	it("propagates a provider failure during synthesis", async () => {
		const f = fixture([
			...Array.from({ length: 12 }, (_, i) => searchTurn(i)),
			{ ...fauxAssistantMessage(""), stopReason: "error", errorMessage: "Synthetic synthesis failure" },
		]);
		await assert.rejects(runResearcherAgent(question, f.opts), /Synthetic synthesis failure/);
	});

	it("honors cancellation at the budget boundary without starting synthesis", async () => {
		const abort = new AbortController();
		const f = fixture([
			...Array.from({ length: 12 }, (_, i) => searchTurn(i)),
			() => { assert.fail("synthesis must not run after cancellation"); },
		]);
		await assert.rejects(runResearcherAgent(question, {
			...f.opts,
			abortSignal: abort.signal,
			onToolStart: (_name, args) => {
				if ((args as { query: string }).query === "facet 11") abort.abort();
			},
		}), { name: "AbortError" });
		assert.equal(f.calls, 12);
	});
});
