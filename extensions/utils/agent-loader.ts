/**
 * Shared Agent Loader — SEC-001 fix
 *
 * Validates agent .md files before handing them to spawn().
 * Replaces the duplicate parseAgentFile() in agent-team, agent-chain, and pi-pi.
 *
 * Validation layers:
 *   1. Name — alphanumeric + dashes/underscores/dots, max 64 chars
 *   2. Tools — checked against a known allowlist, warns on unknowns
 *   3. System prompt — scanned for high-confidence unsafe patterns, capped at 50K chars
 */

import { readFileSync } from "fs";

// ── Types ────────────────────────────────────────

export interface AgentDef {
	name: string;
	description: string;
	tools: string;
	systemPrompt: string;
	file: string;
}

export type ValidationSeverity = "error" | "warning";

export interface ValidationIssue {
	severity: ValidationSeverity;
	field: string;
	message: string;
}

export interface LoadResult {
	agent: AgentDef | null;
	issues: ValidationIssue[];
}

// ── Constants ────────────────────────────────────

/** Max chars for agent name */
const MAX_NAME_LENGTH = 64;

/** Max chars for system prompt body */
const MAX_PROMPT_LENGTH = 50_000;

/** Regex: safe agent names (alphanum, dash, underscore, dot) */
const SAFE_NAME = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,63}$/;

/** Known safe tool names — any tool not in this list triggers a warning */
const KNOWN_TOOLS = new Set([
	"read", "write", "edit", "bash", "grep", "find", "ls",
	"dispatch_agent", "query_experts", "run_chain",
	"tilldone", "sub", "subcont", "subrm", "subclear",
]);

/**
 * High-confidence unsafe prompt patterns.
 *
 * Backticks are intentionally allowed: these agent files are Markdown, and
 * fenced/inline code examples are normal documentation. Subagents receive the
 * prompt via spawn() argument arrays (not a shell), so Markdown backticks are
 * not command substitution at this boundary.
 *
 * Each is { regex, reason }. Error-severity → agent rejected.
 */
const INJECTION_PATTERNS: { regex: RegExp; reason: string }[] = [
	{ regex: /\$\(/, reason: "command substitution $(…)" },
	{ regex: /\|\s*(sh|bash|zsh|dash|ksh)\b/, reason: "pipe to shell interpreter" },
	{ regex: /\x00/, reason: "null byte" },
	{ regex: /\beval\s*\(/, reason: "eval() call" },
	{ regex: /;\s*(rm|chmod|chown|curl|wget|nc|ncat)\s/, reason: "chained destructive command" },
];

// ── Validation ───────────────────────────────────

function validateName(name: string): ValidationIssue[] {
	const issues: ValidationIssue[] = [];

	if (!name) {
		issues.push({ severity: "error", field: "name", message: "name is required" });
		return issues;
	}

	if (name.length > MAX_NAME_LENGTH) {
		issues.push({
			severity: "error",
			field: "name",
			message: `name exceeds ${MAX_NAME_LENGTH} chars (got ${name.length})`,
		});
	}

	if (!SAFE_NAME.test(name)) {
		issues.push({
			severity: "error",
			field: "name",
			message: `name contains disallowed characters: "${name}". Only alphanumeric, dash, underscore, dot allowed.`,
		});
	}

	return issues;
}

function validateTools(tools: string): ValidationIssue[] {
	const issues: ValidationIssue[] = [];
	if (!tools) return issues;

	const toolList = tools.split(",").map((t) => t.trim()).filter(Boolean);

	for (const tool of toolList) {
		if (!KNOWN_TOOLS.has(tool)) {
			issues.push({
				severity: "warning",
				field: "tools",
				message: `unknown tool "${tool}" — not in built-in allowlist`,
			});
		}
	}

	return issues;
}

function validatePrompt(prompt: string): ValidationIssue[] {
	const issues: ValidationIssue[] = [];

	if (prompt.length > MAX_PROMPT_LENGTH) {
		issues.push({
			severity: "error",
			field: "systemPrompt",
			message: `system prompt exceeds ${MAX_PROMPT_LENGTH} chars (got ${prompt.length})`,
		});
	}

	for (const { regex, reason } of INJECTION_PATTERNS) {
		if (regex.test(prompt)) {
			issues.push({
				severity: "error",
				field: "systemPrompt",
				message: `suspicious pattern: ${reason}`,
			});
		}
	}

	return issues;
}

// ── Public API ───────────────────────────────────

/**
 * Parse and validate an agent .md file with frontmatter.
 *
 * @param filePath  Absolute path to the .md file
 * @returns { agent, issues } — agent is null if any error-severity issue found
 */
export function loadAgentFile(filePath: string): LoadResult {
	const issues: ValidationIssue[] = [];

	let raw: string;
	try {
		raw = readFileSync(filePath, "utf-8").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
	} catch (err: any) {
		return {
			agent: null,
			issues: [{ severity: "error", field: "file", message: `cannot read: ${err?.message || err}` }],
		};
	}

	const match = raw.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
	if (!match) {
		return {
			agent: null,
			issues: [{ severity: "error", field: "file", message: "missing or malformed frontmatter (---)" }],
		};
	}

	// Parse frontmatter key: value pairs
	const frontmatter: Record<string, string> = {};
	for (const line of match[1].split("\n")) {
		const idx = line.indexOf(":");
		if (idx > 0) {
			frontmatter[line.slice(0, idx).trim()] = line.slice(idx + 1).trim();
		}
	}

	const name = frontmatter.name || "";
	const description = frontmatter.description || "";
	const tools = frontmatter.tools || "read,grep,find,ls";
	const systemPrompt = match[2].trim();

	// Validate all fields
	issues.push(...validateName(name));
	issues.push(...validateTools(tools));
	issues.push(...validatePrompt(systemPrompt));

	// If any error-severity issue, reject
	const hasError = issues.some((i) => i.severity === "error");

	return {
		agent: hasError
			? null
			: { name, description, tools, systemPrompt, file: filePath },
		issues,
	};
}

/**
 * Format validation issues for display (e.g. in notifications).
 */
export function formatIssues(issues: ValidationIssue[], filePath?: string): string {
	if (issues.length === 0) return "";
	const prefix = filePath ? `${filePath}: ` : "";
	return issues
		.map((i) => `${prefix}[${i.severity.toUpperCase()}] ${i.field}: ${i.message}`)
		.join("\n");
}
