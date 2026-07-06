#!/usr/bin/env node
/**
 * Rip Thymer theme CSS custom properties from the shipped app stylesheet.
 *
 * Standalone — safe to publish in the public thymer-css-tokens resource mirror.
 * Monorepo wrapper: scripts/rip-thymer-theme-css.mjs (adds curated token report).
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** Default Thymer web app origin (any workspace; not org-specific). */
export const DEFAULT_THYMER_ORIGIN = 'https://app.thymer.com';

/** @param {string} absoluteUrl — rip-time logging only; not written to published JSON */
function describeStylesheetSource(absoluteUrl) {
	const u = new URL(absoluteUrl);
	const file = u.pathname.replace(/^\//, '');
	return `${u.origin}/${file}`;
}

export function parseRipArgs(argv, defaults = {}) {
	const opts = {
		base: defaults.base ?? DEFAULT_THYMER_ORIGIN,
		cssUrl: '',
		out: defaults.out ?? __dirname,
		explicitThemes: null,
		all: true,
		saveCss: false,
		quiet: false,
		curatedTokens: defaults.curatedTokens ?? null,
		root: defaults.root ?? path.resolve(__dirname, '..'),
	};
	for (let i = 2; i < argv.length; i += 1) {
		const arg = argv[i];
		if (arg === '--base' && argv[i + 1]) { opts.base = argv[++i].replace(/\/$/, ''); continue; }
		if (arg === '--css-url' && argv[i + 1]) { opts.cssUrl = argv[++i]; continue; }
		if (arg === '--out' && argv[i + 1]) { opts.out = path.resolve(opts.root, argv[++i]); continue; }
		if (arg === '--theme' && argv[i + 1]) { opts.explicitThemes = [argv[++i]]; opts.all = false; continue; }
		if (arg === '--themes' && argv[i + 1]) {
			opts.explicitThemes = argv[++i].split(',').map((s) => s.trim()).filter(Boolean);
			opts.all = false;
			continue;
		}
		if (arg === '--all') { opts.all = true; opts.explicitThemes = null; continue; }
		if (arg === '--save-css') { opts.saveCss = true; continue; }
		if (arg === '--quiet' || arg === '-q') { opts.quiet = true; continue; }
		if (arg === '--help' || arg === '-h') {
			console.log(`Usage: node rip-theme-tokens.mjs [options]

Options:
  --base <url>       Thymer app origin (default: ${DEFAULT_THYMER_ORIGIN})
  --css-url <url>    Fetch this stylesheet directly (skip HTML discovery)
  --out <dir>        Output directory (default: this folder)
  --all              Rip every theme in the stylesheet (default)
  --theme <id>       Single theme id (e.g. thymer-dark-neon-noir)
  --themes <a,b,c>   Comma-separated subset
  --save-css         Also write thymer-app.css cache in output dir
  --quiet, -q        Less per-theme logging

Discovers css/app-<HASH>.css from index.html and writes <theme-id>.json
plus thymer-themes.index.json. Works on any Thymer deployment origin.
`);
			process.exit(0);
		}
	}
	return opts;
}

/** @param {string} css */
export function tokenizeCssRules(css) {
	/** @type {{ selector: string, body: string }[]} */
	const rules = [];
	let i = 0;
	while (i < css.length) {
		if (css.startsWith('/*', i)) {
			const end = css.indexOf('*/', i + 2);
			i = end === -1 ? css.length : end + 2;
			continue;
		}
		if (css[i] === '@') {
			const brace = css.indexOf('{', i);
			if (brace === -1) break;
			const prelude = css.slice(i, brace).trim();
			let depth = 1;
			let j = brace + 1;
			while (j < css.length && depth > 0) {
				if (css[j] === '{') depth += 1;
				else if (css[j] === '}') depth -= 1;
				j += 1;
			}
			const body = css.slice(brace + 1, j - 1);
			if (/^@media\b/i.test(prelude) || /^@supports\b/i.test(prelude)) {
				for (const nested of tokenizeCssRules(body)) {
					rules.push({ selector: `${prelude} ${nested.selector}`, body: nested.body });
				}
			}
			i = j;
			continue;
		}
		const brace = css.indexOf('{', i);
		if (brace === -1) break;
		const selector = css.slice(i, brace).trim();
		let depth = 1;
		let j = brace + 1;
		while (j < css.length && depth > 0) {
			if (css[j] === '{') depth += 1;
			else if (css[j] === '}') depth -= 1;
			j += 1;
		}
		const body = css.slice(brace + 1, j - 1);
		if (selector && !selector.startsWith('@')) rules.push({ selector, body });
		i = j;
	}
	return rules;
}

/** @param {string} body */
export function parseCustomProperties(body) {
	/** @type {Record<string, string>} */
	const vars = {};
	for (const match of body.matchAll(/(--[a-zA-Z0-9_-]+)\s*:\s*([^;}{]+)/g)) {
		vars[match[1]] = match[2].trim();
	}
	return vars;
}

/** @param {string} selectorPart @param {string} themeId */
function selectorPartMatchesTheme(selectorPart, themeId) {
	const s = selectorPart.trim();
	if (!s) return false;
	if (s === 'html' || s === ':root' || s === 'body') return true;
	const escaped = themeId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
	const exactTheme = new RegExp(`data-theme=${escaped}(?:[,\\]\\s{]|$)`);
	if (exactTheme.test(s)) return true;
	const isLight = themeId.includes('light');
	const isDark = themeId.includes('dark');
	if (s === 'html.is-light' && isLight) return true;
	if (s === 'html.is-dark' && isDark) return true;
	if (s === 'html.basic-light' && isLight) return true;
	if (s === 'html.basic-dark' && isDark) return true;
	return false;
}

/** @param {string} selector @param {string} themeId */
export function selectorMatchesTheme(selector, themeId) {
	return selector.split(',').some((part) => selectorPartMatchesTheme(part, themeId));
}

/** @param {string} css @param {string} themeId */
export function extractThemeVariables(css, themeId) {
	const rules = tokenizeCssRules(css);
	/** @type {Record<string, string>} */
	const merged = {};
	for (const rule of rules) {
		if (!selectorMatchesTheme(rule.selector, themeId)) continue;
		Object.assign(merged, parseCustomProperties(rule.body));
	}
	const variables = Object.entries(merged)
		.sort(([a], [b]) => a.localeCompare(b))
		.map(([name, value]) => ({ name, value }));
	return { variables, merged };
}

/** @param {Record<string, string>} merged @param {{ name: string, label?: string }[]} tokens */
export function buildCuratedReport(merged, tokens) {
	if (!tokens?.length) return { curated: [], curatedMissing: [] };
	const curated = [];
	const curatedMissing = [];
	for (const token of tokens) {
		const value = merged[token.name];
		if (value) curated.push({ name: token.name, label: token.label ?? token.name, value });
		else curatedMissing.push(token.name);
	}
	return { curated, curatedMissing };
}

/** @param {string} value */
export function isColorish(value) {
	return /^(#[0-9a-f]{3,8}|rgba?\(|hsla?\(|color\(|oklch\(|oklab\(|color-mix\()/i.test(value.trim());
}

export async function discoverStylesheetUrl(base) {
	const res = await fetch(`${base}/`);
	if (!res.ok) throw new Error(`Failed to fetch ${base}/ (${res.status})`);
	const html = await res.text();
	const match = html.match(/href=['"]css\/(app-[A-Z0-9]+\.css)['"]/i);
	if (!match) throw new Error('Could not find css/app-*.css in Thymer index.html');
	return `${base}/css/${match[1]}`;
}

export async function fetchStylesheet(url) {
	const res = await fetch(url);
	if (!res.ok) throw new Error(`Failed to fetch ${url} (${res.status})`);
	return res.text();
}

/** @param {string} css */
export function listThemeIds(css) {
	const ids = new Set();
	for (const match of css.matchAll(/data-theme=([a-zA-Z0-9_-]+)/g)) ids.add(match[1]);
	return [...ids].sort();
}

/** @param {Date} [date] @returns {string} e.g. "July 6, 2026" */
export function formatRipDate(date = new Date()) {
	return date.toLocaleDateString('en-US', {
		year: 'numeric',
		month: 'long',
		day: 'numeric',
	});
}

/** @param {string} themeId */
export function themeAppearance(themeId) {
	if (themeId.startsWith('basic-light') || /^thymer-light/.test(themeId)) return 'light';
	if (themeId.startsWith('basic-dark') || themeId.includes('dark')) return 'dark';
	return 'unknown';
}

/** @param {ReturnType<typeof parseRipArgs>} opts */
export async function runRip(opts) {
	const cssUrl = opts.cssUrl || await discoverStylesheetUrl(opts.base);
	if (!opts.quiet) console.log('Fetching', cssUrl);
	const css = await fetchStylesheet(cssUrl);
	const rippedAt = formatRipDate();
	if (!opts.quiet) console.log('Source:', describeStylesheetSource(cssUrl), '(hash not stored in output)');
	const allThemeIds = listThemeIds(css);
	const themeIds = opts.explicitThemes?.length ? opts.explicitThemes : allThemeIds;

	if (opts.all && !opts.explicitThemes && !opts.quiet) {
		console.log(`Ripping all ${themeIds.length} themes from stylesheet`);
	}

	fs.mkdirSync(opts.out, { recursive: true });
	if (opts.saveCss) {
		const cssPath = path.join(opts.out, 'thymer-app.css');
		fs.writeFileSync(cssPath, css);
		if (!opts.quiet) console.log('Cached', cssPath, `(${css.length} bytes)`);
	}

	/** @type {object[]} */
	const indexEntries = [];

	for (const themeId of themeIds) {
		const { variables, merged } = extractThemeVariables(css, themeId);
		const { curated, curatedMissing } = buildCuratedReport(merged, opts.curatedTokens);
		const colorVariables = variables.filter((v) => isColorish(v.value));

		const snapshot = {
			source: 'thymer-css',
			rippedAt,
			themeId,
			appearance: themeAppearance(themeId),
			variables,
			...(opts.curatedTokens ? { curated, curatedMissing } : {}),
			stats: {
				totalVariables: variables.length,
				colorVariables: colorVariables.length,
				...(opts.curatedTokens ? {
					curatedFound: curated.length,
					curatedMissing: curatedMissing.length,
				} : {}),
			},
		};

		const outPath = path.join(opts.out, `${themeId}.json`);
		fs.writeFileSync(outPath, `${JSON.stringify(snapshot, null, 2)}\n`);
		const rel = path.relative(opts.root, outPath);
		if (opts.quiet) {
			console.log('  ', rel || outPath, snapshot.stats.totalVariables, 'vars');
		} else {
			console.log('Wrote', rel || outPath, '—', snapshot.stats.totalVariables, 'vars');
		}

		indexEntries.push({
			rippedAt,
			themeId,
			appearance: themeAppearance(themeId),
			stats: {
				totalVariables: snapshot.stats.totalVariables,
				colorVariables: snapshot.stats.colorVariables,
			},
		});
	}

	const indexPath = path.join(opts.out, 'thymer-themes.index.json');
	const index = {
		rippedAt,
		themeCount: allThemeIds.length,
		rippedCount: indexEntries.length,
		availableThemes: allThemeIds,
		rips: indexEntries,
	};
	fs.writeFileSync(indexPath, `${JSON.stringify(index, null, 2)}\n`);
	if (!opts.quiet) {
		const rel = path.relative(opts.root, indexPath);
		console.log('Done:', indexEntries.length, 'themes →', rel || indexPath);
	}
	return index;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
	runRip(parseRipArgs(process.argv)).catch((err) => {
		console.error(err?.message || err);
		process.exit(1);
	});
}
