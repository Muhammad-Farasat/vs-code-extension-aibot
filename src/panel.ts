import * as vscode from 'vscode';

export type ActionType = 'explain' | 'fix' | 'comment' | 'test';

export const ACTION_CONFIG: Record<ActionType, { label: string; prompt: (code: string) => string }> = {
	explain: {
		label: '💡 Explain Code',
		prompt: (code) => `Explain this code clearly and concisely:\n\n${code}`,
	},
	fix: {
		label: '🔧 Fix Code',
		prompt: (code) => `Find and fix any bugs in this code. Show the corrected code and briefly explain what was wrong:\n\n${code}`,
	},
	comment: {
		label: '📝 Add Comments',
		prompt: (code) => `Add clear, helpful documentation comments to this code and return the fully commented version:\n\n${code}`,
	},
	test: {
		label: '🧪 Generate Tests',
		prompt: (code) => `Generate comprehensive unit tests for this code:\n\n${code}`,
	},
};

// ── HTML escape helper ────────────────────────────────────────────────────────

function esc(s: string): string {
	return s
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;');
}

// ── Client-side script (built as plain string to avoid TS template conflicts) ─

function buildScript(): string {
	const lines: string[] = [
		'(function(){',
		'  var el = document.getElementById("fax-data");',
		'  if (!el) { return; }',
		'  var data = JSON.parse(el.textContent || "{}");',
		'  var respEl = document.getElementById("resp");',
		'  var metaEl = document.getElementById("meta");',
		'  if (respEl) { respEl.innerHTML = renderMd(data.response || ""); }',
		'  if (metaEl) { metaEl.textContent = "Model: " + data.model + "  ·  " + new Date().toLocaleTimeString(); }',
		'',
		'  function escH(s) {',
		'    return s.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");',
		'  }',
		'',
		'  function renderMd(raw) {',
		'    var blocks = [];',
		'    var tick3 = String.fromCharCode(96,96,96);',
		'    var tilde3 = "~~~";',
		'',
		'    // fenced code blocks',
		'    var fenceRe = new RegExp("(" + tick3 + "|" + tilde3 + ")(\\\\w*)\\\\n?([\\\\s\\\\S]*?)\\\\1", "g");',
		'    var s = raw.replace(fenceRe, function(_m, _f, _lang, code) {',
		'      var i = blocks.length;',
		'      blocks.push("<pre><code>" + escH(code.trimEnd()) + "</code></pre>");',
		'      return "\\x02" + i + "\\x03";',
		'    });',
		'',
		'    // inline code',
		'    var tick = String.fromCharCode(96);',
		'    var inlineRe = new RegExp(tick + "([^" + tick + "\\\\n]+)" + tick, "g");',
		'    s = s.replace(inlineRe, function(_m, code) {',
		'      var i = blocks.length;',
		'      blocks.push("<code>" + escH(code) + "</code>");',
		'      return "\\x02" + i + "\\x03";',
		'    });',
		'',
		'    // escape remaining HTML',
		'    s = escH(s);',
		'',
		'    // headers',
		'    s = s.replace(/^### (.+)$/mg, "<h3>$1</h3>");',
		'    s = s.replace(/^## (.+)$/mg,  "<h2>$1</h2>");',
		'    s = s.replace(/^# (.+)$/mg,   "<h1>$1</h1>");',
		'',
		'    // hr',
		'    s = s.replace(/^---+$/mg, "<hr>");',
		'',
		'    // bold / italic',
		'    s = s.replace(/\\*\\*([^*\\n]+)\\*\\*/g, "<strong>$1</strong>");',
		'    s = s.replace(/\\*([^*\\n]+)\\*/g, "<em>$1</em>");',
		'',
		'    // unordered lists',
		'    s = s.replace(/^[-*] (.+)$/mg, "<li>$1</li>");',
		'    s = s.replace(/(<li>[\\s\\S]*?<\\/li>\\n?)+/g, function(m) { return "<ul>" + m + "</ul>"; });',
		'',
		'    // paragraphs',
		'    s = s.split(/\\n\\n+/).map(function(p) {',
		'      p = p.trim();',
		'      if (!p) { return ""; }',
		'      if (/^<(h[1-6]|ul|ol|hr|pre)/.test(p)) { return p; }',
		'      return "<p>" + p.replace(/\\n/g, "<br>") + "</p>";',
		'    }).join("\\n");',
		'',
		'    // restore code blocks',
		'    s = s.replace(/\\x02(\\d+)\\x03/g, function(_m, i) { return blocks[+i]; });',
		'    return s;',
		'  }',
		'})();',
	];
	return lines.join('\n');
}

// ── CSS (also built as plain string) ─────────────────────────────────────────

const CSS = [
	'*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}',
	'body{font-family:var(--vscode-font-family,system-ui,sans-serif);font-size:13px;line-height:1.65;',
	'  background:var(--vscode-editor-background,#1e1e1e);color:var(--vscode-editor-foreground,#d4d4d4);padding-bottom:32px}',
	'header{position:sticky;top:0;z-index:10;display:flex;align-items:center;gap:10px;padding:10px 16px;',
	'  background:var(--vscode-titleBar-activeBackground,#2d2d2d);',
	'  border-bottom:1px solid var(--vscode-panel-border,#444);font-weight:600;font-size:13px}',
	'.badge{display:inline-block;padding:1px 8px;border-radius:20px;font-size:10px;font-weight:700;',
	'  letter-spacing:.06em;text-transform:uppercase;background:var(--vscode-button-background,#0e639c);',
	'  color:var(--vscode-button-foreground,#fff)}',
	'main{padding:16px}',
	'.idle{padding:40px 0;text-align:center;opacity:.5}',
	'.loading{display:flex;flex-direction:column;align-items:center;gap:16px;padding:60px 0;opacity:.75}',
	'.spinner{width:32px;height:32px;border:3px solid var(--vscode-panel-border,#444);',
	'  border-top-color:var(--vscode-button-background,#0e639c);border-radius:50%;animation:spin .8s linear infinite}',
	'@keyframes spin{to{transform:rotate(360deg)}}',
	'.error-box{display:flex;align-items:flex-start;gap:10px;padding:12px 14px;border-radius:4px;',
	'  background:var(--vscode-inputValidation-errorBackground,#5a1d1d);',
	'  border:1px solid var(--vscode-inputValidation-errorBorder,#be1100)}',
	'.snippet{margin-bottom:16px;border:1px solid var(--vscode-panel-border,#444);border-radius:4px;overflow:hidden}',
	'.snippet summary{padding:6px 12px;font-size:11px;font-weight:600;letter-spacing:.05em;text-transform:uppercase;',
	'  cursor:pointer;background:var(--vscode-sideBar-background,#252526);',
	'  color:var(--vscode-descriptionForeground,#888);user-select:none}',
	'.snippet summary:hover{background:var(--vscode-list-hoverBackground,#2a2d2e)}',
	'.snippet-pre{margin:0;padding:12px;overflow:auto;max-height:200px;',
	'  background:var(--vscode-textCodeBlock-background,#1a1a1a);',
	'  font-family:var(--vscode-editor-font-family,Consolas,monospace);font-size:12px;white-space:pre}',
	'.response{font-size:13px;line-height:1.7}',
	'.response h1,.response h2,.response h3{margin:18px 0 8px;font-weight:600}',
	'.response h1{font-size:17px;border-bottom:1px solid var(--vscode-panel-border,#444);padding-bottom:6px}',
	'.response h2{font-size:15px} .response h3{font-size:13px}',
	'.response p{margin:8px 0}',
	'.response pre{margin:10px 0;padding:12px;border-radius:4px;',
	'  background:var(--vscode-textCodeBlock-background,#1a1a1a);',
	'  font-family:var(--vscode-editor-font-family,Consolas,monospace);',
	'  font-size:12px;overflow-x:auto;border:1px solid var(--vscode-panel-border,#3c3c3c)}',
	'.response code{font-family:var(--vscode-editor-font-family,Consolas,monospace);font-size:12px;',
	'  background:var(--vscode-textCodeBlock-background,#1a1a1a);padding:1px 5px;border-radius:3px}',
	'.response pre code{background:none;padding:0}',
	'.response ul,.response ol{padding-left:20px;margin:8px 0}',
	'.response li{margin:3px 0}',
	'.response strong{font-weight:700} .response em{font-style:italic;opacity:.85}',
	'.response hr{border:none;border-top:1px solid var(--vscode-panel-border,#444);margin:16px 0}',
	'.meta{margin-top:20px;padding-top:10px;border-top:1px solid var(--vscode-panel-border,#333);',
	'  font-size:10px;opacity:.45;text-align:right;font-family:var(--vscode-editor-font-family,monospace)}',
].join('\n');

// ── Panel class ───────────────────────────────────────────────────────────────

export class FaxAiPanel {
	private static instance: FaxAiPanel | undefined;
	private readonly panel: vscode.WebviewPanel;

	private constructor() {
		this.panel = vscode.window.createWebviewPanel(
			'faxAi',
			'fax-ai',
			{ viewColumn: vscode.ViewColumn.Beside, preserveFocus: true },
			{ enableScripts: true, retainContextWhenHidden: true }
		);
		this.panel.onDidDispose(() => { FaxAiPanel.instance = undefined; });
		this.panel.webview.html = this.buildHtml('idle', {});
	}

	static getInstance(): FaxAiPanel {
		if (!FaxAiPanel.instance) {
			FaxAiPanel.instance = new FaxAiPanel();
		} else {
			FaxAiPanel.instance.panel.reveal(vscode.ViewColumn.Beside, true);
		}
		return FaxAiPanel.instance;
	}

	showLoading(action: ActionType): void {
		this.panel.webview.html = this.buildHtml('loading', { label: ACTION_CONFIG[action].label });
	}

	showResult(action: ActionType, snippet: string, response: string, model: string): void {
		this.panel.webview.html = this.buildHtml('result', {
			label: ACTION_CONFIG[action].label, snippet, response, model,
		});
	}

	showError(action: ActionType, message: string): void {
		this.panel.webview.html = this.buildHtml('error', {
			label: ACTION_CONFIG[action].label, errorMessage: message,
		});
	}

	dispose(): void { this.panel.dispose(); }

	// ── HTML builder ────────────────────────────────────────────────────────

	private buildHtml(
		state: 'idle' | 'loading' | 'result' | 'error',
		d: { label?: string; snippet?: string; response?: string; model?: string; errorMessage?: string }
	): string {
		const label = d.label ?? 'fax-ai';
		const script = buildScript();

		let body: string;
		let dataTag = '';

		if (state === 'idle') {
			body = '<div class="idle"><p>Select some code in the editor, then run a fax-ai command.</p></div>';
		} else if (state === 'loading') {
			body = '<div class="loading"><div class="spinner"></div><p>Thinking\u2026</p></div>';
		} else if (state === 'error') {
			body = '<div class="error-box"><span>\u26a0\ufe0f</span><p>' + esc(d.errorMessage ?? 'Unknown error') + '</p></div>';
		} else {
			const jsonData = JSON.stringify({ response: d.response ?? '', snippet: d.snippet ?? '', model: d.model ?? '' });
			dataTag = '<script type="application/json" id="fax-data">' + jsonData + '<\/script>';
			body = [
				'<details class="snippet" open>',
				'  <summary>Selected Code</summary>',
				'  <pre class="snippet-pre"><code>' + esc(d.snippet ?? '') + '</code></pre>',
				'</details>',
				'<div class="response" id="resp"></div>',
				'<div class="meta" id="meta"></div>',
			].join('\n');
		}

		return [
			'<!DOCTYPE html>',
			'<html lang="en">',
			'<head>',
			'<meta charset="UTF-8">',
			'<meta http-equiv="Content-Security-Policy" content="default-src \'none\'; script-src \'unsafe-inline\'; style-src \'unsafe-inline\';">',
			'<meta name="viewport" content="width=device-width,initial-scale=1">',
			'<title>fax-ai</title>',
			'<style>' + CSS + '</style>',
			'</head>',
			'<body>',
			'<header><span>' + esc(label) + '</span><span class="badge">fax-ai</span></header>',
			'<main>' + body + '</main>',
			dataTag,
			'<script>' + script + '<\/script>',
			'</body>',
			'</html>',
		].join('\n');
	}
}
