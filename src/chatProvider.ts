import * as vscode from 'vscode';

export class ChatProvider implements vscode.WebviewViewProvider {
	private _view?: vscode.WebviewView;

	constructor(private readonly _extensionUri: vscode.Uri) {}

	public resolveWebviewView(webviewView: vscode.WebviewView) {
		this._view = webviewView;

		webviewView.webview.options = {
			enableScripts: true,
			localResourceRoots: [this._extensionUri]
		};

		webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);

		webviewView.webview.onDidReceiveMessage(async (data) => {
			switch (data.type) {
				case 'sendMessage':
					await vscode.commands.executeCommand('ai.processChat', data.value);
					break;
				case 'applyCode':
					await vscode.commands.executeCommand('ai.applyCode', data.value);
					break;
			}
		});
	}

	public postMessage(message: any) {
		if (this._view) {
			this._view.webview.postMessage(message);
		}
	}

	private _getHtmlForWebview(webview: vscode.Webview) {
		return `<!DOCTYPE html>
			<html lang="en">
			<head>
				<meta charset="UTF-8">
				<meta name="viewport" content="width=device-width, initial-scale=1.0">
				<style>
					body { font-family: var(--vscode-font-family); color: var(--vscode-foreground); padding: 10px; display: flex; flex-direction: column; height: 100vh; margin: 0; box-sizing: border-box; }
					#chat-history { flex-grow: 1; overflow-y: auto; margin-bottom: 10px; display: flex; flex-direction: column; gap: 10px; padding-bottom: 20px; }
					.message { padding: 8px 12px; border-radius: 6px; max-width: 90%; word-wrap: break-word; font-size: 13px; line-height: 1.5; }
					.user { background: var(--vscode-button-secondaryBackground); align-self: flex-end; color: var(--vscode-button-secondaryForeground); }
					.ai { background: var(--vscode-editor-background); border: 1px solid var(--vscode-panel-border); align-self: flex-start; }
					.ai pre { background: var(--vscode-textCodeBlock-background); padding: 8px; border-radius: 4px; overflow-x: auto; position: relative; margin: 8px 0; }
					.ai code { font-family: var(--vscode-editor-font-family); }
					.apply-btn { position: absolute; top: 4px; right: 4px; background: var(--vscode-button-background); color: var(--vscode-button-foreground); border: none; padding: 2px 6px; border-radius: 3px; font-size: 10px; cursor: pointer; opacity: 0.8; }
					.apply-btn:hover { opacity: 1; }
					#input-container { display: flex; gap: 5px; background: var(--vscode-input-background); border: 1px solid var(--vscode-input-border); border-radius: 4px; padding: 4px; }
					#user-input { flex-grow: 1; background: transparent; border: none; color: var(--vscode-input-foreground); outline: none; padding: 4px; font-family: inherit; font-size: 13px; resize: none; min-height: 24px; max-height: 120px; }
					#send-btn { background: transparent; border: none; color: var(--vscode-button-background); cursor: pointer; padding: 4px; display: flex; align-items: center; justify-content: center; }
					.loading-dots { display: inline-flex; gap: 3px; }
					.dot { width: 4px; height: 4px; background: currentColor; border-radius: 50%; animation: pulse 1.4s infinite; }
					.dot:nth-child(2) { animation-delay: 0.2s; }
					.dot:nth-child(3) { animation-delay: 0.4s; }
					@keyframes pulse { 0%, 100% { opacity: 0.3; } 50% { opacity: 1; } }
				</style>
			</head>
			<body>
				<div id="chat-history"></div>
				<div id="input-container">
					<textarea id="user-input" placeholder="Ask fax-ai..." rows="1"></textarea>
					<button id="send-btn">
						<svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><path d="M1.146 1.146a.5.5 0 0 1 .538-.093l13 5.5a.5.5 0 0 1 0 .914l-13 5.5a.5.5 0 0 1-.684-.614L2.484 8 1 3.546a.5.5 0 0 1 .146-.4zM2.87 3.99L4.01 7.5H9.5a.5.5 0 0 1 0 1H4.01L2.87 12.01L13.11 8 2.87 3.99z"/></svg>
					</button>
				</div>

				<script>
					const vscode = acquireVsCodeApi();
					const history = document.getElementById('chat-history');
					const input = document.getElementById('user-input');
					const sendBtn = document.getElementById('send-btn');

					function addMessage(text, role) {
						const div = document.createElement('div');
						div.className = 'message ' + role;
						
						if (role === 'ai') {
							div.innerHTML = renderMarkdown(text);
						} else {
							div.textContent = text;
						}
						
						history.appendChild(div);
						history.scrollTop = history.scrollHeight;
						return div;
					}

					function renderMarkdown(text) {
						// Detect code blocks with potential file paths
						let html = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
						
						// Match code blocks and look for a filename preceding them
						html = html.replace(/(?:(file:\\s*\`?([^\\n\`]+)\`?)\\n)?\`\`\`(\\w*)\\n?([\\s\\S]*?)\`\`\`/gi, (m, fileGroup, filePath, lang, code) => {
							const escapedCode = code.trim();
							// Use a more robust b64 for special chars
							const b64 = btoa(unescape(encodeURIComponent(escapedCode)));
							const label = filePath ? \`Apply to \${filePath}\` : 'Apply to Editor';
							const pathArg = filePath ? \`,'\${filePath}'\` : '';
							return \`<div class="code-header">\${filePath || ''}</div><pre><code>\${escapedCode}</code><button class="apply-btn" onclick="applyCode('\${b64}'\${pathArg})">\${label}</button></pre>\`;
						});
						html = html.replace(/\\n/g, '<br>');
						return html;
					}

					window.applyCode = (base64Code, filePath) => {
						vscode.postMessage({ type: 'applyCode', value: decodeURIComponent(escape(atob(base64Code))), path: filePath });
					};

					sendBtn.onclick = () => {
						const text = input.value.trim();
						if (text) {
							addMessage(text, 'user');
							vscode.postMessage({ type: 'sendMessage', value: text });
							input.value = '';
							input.style.height = 'auto';
							
							const loading = addMessage('', 'ai');
							loading.id = 'current-loading';
							loading.innerHTML = '<div class="loading-dots"><div class="dot"></div><div class="dot"></div><div class="dot"></div></div>';
						}
					};

					input.onkeydown = (e) => {
						if (e.key === 'Enter' && !e.shiftKey) {
							e.preventDefault();
							sendBtn.click();
						}
					};

					input.oninput = () => {
						input.style.height = 'auto';
						input.style.height = input.scrollHeight + 'px';
					};

					window.addEventListener('message', event => {
						const message = event.data;
						switch (message.type) {
							case 'addAiResponse':
								const loading = document.getElementById('current-loading');
								if (loading) loading.remove();
								addMessage(message.value, 'ai');
								break;
							case 'updateAiResponse':
								const loadingDots = document.getElementById('current-loading');
								if (loadingDots) loadingDots.remove();
								
								let lastAiMessage = history.querySelector('.ai:last-child');
								if (!lastAiMessage || lastAiMessage.id === 'current-loading') {
									lastAiMessage = addMessage('', 'ai');
								}
								lastAiMessage.innerHTML = renderMarkdown(message.value);
								history.scrollTop = history.scrollHeight;
								break;
						}
					});
				</script>
			</body>
			</html>`;
	}
}
