/**
 * Tests for the shared agent loader (SEC-001 fix).
 *
 * Run with: npx tsx --test tests/agent-loader.test.ts
 */

import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { writeFileSync, mkdirSync, rmSync, readdirSync, statSync } from "fs";
import { join, resolve } from "path";
import { tmpdir } from "os";
import { loadAgentFile, formatIssues } from "../extensions/utils/agent-loader.ts";

const TMP = join(tmpdir(), `agent-loader-test-${Date.now()}`);

function walkMarkdownFiles(dir: string): string[] {
	return readdirSync(dir)
		.flatMap((entry) => {
			const p = join(dir, entry);
			const stat = statSync(p);
			if (stat.isDirectory()) return walkMarkdownFiles(p);
			return p.endsWith(".md") ? [p] : [];
		});
}

function writeAgent(filename: string, content: string): string {
	const p = join(TMP, filename);
	writeFileSync(p, content, "utf-8");
	return p;
}

// ── Valid agents ─────────────────────────────────

describe("loadAgentFile — valid agents", () => {
	before(() => mkdirSync(TMP, { recursive: true }));
	after(() => rmSync(TMP, { recursive: true, force: true }));

	it("parses a minimal valid agent", () => {
		const p = writeAgent("valid.md", `---
name: builder
description: Builds things
tools: read,write,edit,bash,grep,find,ls
---
You are a builder agent.
`);
		const { agent, issues } = loadAgentFile(p);
		assert.ok(agent, "agent should not be null");
		assert.equal(agent.name, "builder");
		assert.equal(agent.description, "Builds things");
		assert.equal(agent.tools, "read,write,edit,bash,grep,find,ls");
		assert.ok(agent.systemPrompt.includes("builder agent"));
		assert.equal(agent.file, p);
		assert.equal(issues.filter((i) => i.severity === "error").length, 0);
	});

	it("uses default tools when not specified", () => {
		const p = writeAgent("no-tools.md", `---
name: scout
description: Scout agent
---
You explore.
`);
		const { agent } = loadAgentFile(p);
		assert.ok(agent);
		assert.equal(agent.tools, "read,grep,find,ls");
	});

	it("allows dashes, underscores, dots in name", () => {
		const p = writeAgent("complex-name.md", `---
name: my-agent_v2.1
---
System prompt.
`);
		const { agent, issues } = loadAgentFile(p);
		assert.ok(agent);
		assert.equal(issues.filter((i) => i.severity === "error").length, 0);
	});

	it("handles CRLF line endings", () => {
		const p = writeAgent("crlf.md", "---\r\nname: crlf-agent\r\ntools: read,ls\r\n---\r\nPrompt body\r\n");
		const { agent } = loadAgentFile(p);
		assert.ok(agent, "CRLF should be normalized");
		assert.equal(agent.name, "crlf-agent");
	});
});

// ── Name validation ──────────────────────────────

describe("loadAgentFile — name validation", () => {
	before(() => mkdirSync(TMP, { recursive: true }));
	after(() => rmSync(TMP, { recursive: true, force: true }));

	it("rejects missing name", () => {
		const p = writeAgent("no-name.md", `---
description: test
---
body
`);
		const { agent, issues } = loadAgentFile(p);
		assert.equal(agent, null);
		assert.ok(issues.some((i) => i.severity === "error" && i.field === "name"));
	});

	it("rejects name with shell metacharacters", () => {
		const p = writeAgent("bad-name.md", `---
name: agent;rm -rf /
---
body
`);
		const { agent, issues } = loadAgentFile(p);
		assert.equal(agent, null);
		assert.ok(issues.some((i) => i.severity === "error" && i.field === "name"));
	});

	it("rejects name with spaces", () => {
		const p = writeAgent("space-name.md", `---
name: my agent
---
body
`);
		const { agent } = loadAgentFile(p);
		assert.equal(agent, null);
	});

	it("rejects name longer than 64 chars", () => {
		const longName = "a".repeat(65);
		const p = writeAgent("long-name.md", `---
name: ${longName}
---
body
`);
		const { agent, issues } = loadAgentFile(p);
		assert.equal(agent, null);
		assert.ok(issues.some((i) => i.message.includes("exceeds")));
	});
});

// ── Tools validation ─────────────────────────────

describe("loadAgentFile — tools validation", () => {
	before(() => mkdirSync(TMP, { recursive: true }));
	after(() => rmSync(TMP, { recursive: true, force: true }));

	it("warns on unknown tools", () => {
		const p = writeAgent("unknown-tool.md", `---
name: test-agent
tools: read,custom_exploit
---
body
`);
		const { agent, issues } = loadAgentFile(p);
		assert.ok(agent, "unknown tools are warnings, not errors");
		assert.ok(issues.some((i) => i.severity === "warning" && i.field === "tools"));
	});

	it("no warnings on all known tools", () => {
		const p = writeAgent("known-tools.md", `---
name: test-agent
tools: read,write,edit,bash,grep,find,ls
---
body
`);
		const { issues } = loadAgentFile(p);
		assert.equal(issues.filter((i) => i.field === "tools").length, 0);
	});
});

// ── System prompt validation ─────────────────────

describe("loadAgentFile — prompt injection detection", () => {
	before(() => mkdirSync(TMP, { recursive: true }));
	after(() => rmSync(TMP, { recursive: true, force: true }));

	it("rejects $() command substitution", () => {
		const p = writeAgent("cmd-sub.md", `---
name: evil
---
Run this: $(rm -rf /)
`);
		const { agent } = loadAgentFile(p);
		assert.equal(agent, null);
	});

	it("allows Markdown code spans and fenced command examples", () => {
		const p = writeAgent("markdown-code.md", `---
name: docs-agent
---
Use \`pi -e extensions/minimal.ts\` to launch.

\`\`\`bash
echo "documented example"
\`\`\`
`);
		const { agent, issues } = loadAgentFile(p);
		assert.ok(agent, "Markdown code examples should not be treated as shell execution");
		assert.equal(issues.filter((i) => i.severity === "error").length, 0);
	});

	it("rejects pipe to shell", () => {
		const p = writeAgent("pipe-shell.md", `---
name: evil
---
echo payload | bash
`);
		const { agent } = loadAgentFile(p);
		assert.equal(agent, null);
	});

	it("rejects null bytes", () => {
		const p = writeAgent("null-byte.md", "---\nname: evil\n---\nhello\x00world\n");
		const { agent } = loadAgentFile(p);
		assert.equal(agent, null);
	});

	it("rejects eval()", () => {
		const p = writeAgent("eval.md", `---
name: evil
---
eval(dangerous_code)
`);
		const { agent } = loadAgentFile(p);
		assert.equal(agent, null);
	});

	it("rejects chained destructive commands", () => {
		const p = writeAgent("chain.md", `---
name: evil
---
something; rm -rf /
`);
		const { agent } = loadAgentFile(p);
		assert.equal(agent, null);
	});

	it("rejects prompts exceeding 50K chars", () => {
		const longPrompt = "x".repeat(50_001);
		const p = writeAgent("long-prompt.md", `---
name: verbose
---
${longPrompt}
`);
		const { agent } = loadAgentFile(p);
		assert.equal(agent, null);
	});

	it("allows normal system prompts", () => {
		const p = writeAgent("normal.md", `---
name: builder
---
You are a builder agent. You write code, run tests, and fix bugs.
Use the read tool to explore the codebase. Use edit to make changes.
Always explain your reasoning before making changes.
`);
		const { agent } = loadAgentFile(p);
		assert.ok(agent, "normal prompts should pass");
	});
});

// ── File errors ──────────────────────────────────

describe("loadAgentFile — file errors", () => {
	before(() => mkdirSync(TMP, { recursive: true }));
	after(() => rmSync(TMP, { recursive: true, force: true }));

	it("handles missing file", () => {
		const { agent, issues } = loadAgentFile("/nonexistent/path.md");
		assert.equal(agent, null);
		assert.ok(issues.some((i) => i.severity === "error" && i.field === "file"));
	});

	it("handles file without frontmatter", () => {
		const p = writeAgent("no-frontmatter.md", "Just some text, no frontmatter delimiters.");
		const { agent, issues } = loadAgentFile(p);
		assert.equal(agent, null);
		assert.ok(issues.some((i) => i.message.includes("frontmatter")));
	});
});

// ── Repository fixtures ──────────────────────────

describe("loadAgentFile — repository fixtures", () => {
	it("loads every checked-in .pi agent definition", () => {
		const agentDir = resolve(".pi", "agents");
		const failures = walkMarkdownFiles(agentDir)
			.map((file) => ({ file, result: loadAgentFile(file) }))
			.filter(({ result }) => result.issues.some((issue) => issue.severity === "error"));

		assert.deepEqual(
			failures.map(({ file, result }) => ({ file, issues: result.issues })),
			[],
		);
	});
});

// ── formatIssues ─────────────────────────────────

describe("formatIssues", () => {
	it("returns empty string for no issues", () => {
		assert.equal(formatIssues([]), "");
	});

	it("formats issues with file path prefix", () => {
		const result = formatIssues(
			[{ severity: "error", field: "name", message: "name is required" }],
			"/path/to/agent.md",
		);
		assert.ok(result.includes("/path/to/agent.md"));
		assert.ok(result.includes("[ERROR]"));
		assert.ok(result.includes("name is required"));
	});
});
