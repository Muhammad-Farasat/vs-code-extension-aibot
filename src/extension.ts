import * as vscode from 'vscode';
import { ChatProvider } from './chatProvider';

export function activate(context: vscode.ExtensionContext) {
	console.log('[fax-ai] Extension activating...');

	const provider = new ChatProvider(context.extensionUri);
	
	context.subscriptions.push(
		vscode.window.registerWebviewViewProvider('faxAi.chatView', provider)
	);

	// Track last active editor for context
	let lastActiveEditor = vscode.window.activeTextEditor;
	vscode.window.onDidChangeActiveTextEditor(editor => {
		if (editor) { lastActiveEditor = editor; }
	});

	// Helper to get config
	function getAIConfig() {
		const config = vscode.workspace.getConfiguration('faxAi');
		const endpoint = config.get<string>('endpoint', 'http://localhost:11434').replace(/\/$/, '');
		const model = config.get<string>('model', 'gemma:2b');
		const apiKey = config.get<string>('apiKey', '');
		
		let url = endpoint;
		if (!url.includes('/v1')) {
			const isOpenWebUI = endpoint.includes(':3000');
			url += isOpenWebUI ? '/api/v1/chat/completions' : '/v1/chat/completions';
		} else if (!url.endsWith('/chat/completions')) {
			url += '/chat/completions';
		}
		
		return { url, model, apiKey };
	}

	// --- Internal: Process Chat ---
	const processChatDisposable = vscode.commands.registerCommand('ai.processChat', async (userMessage: string) => {
		const editor = vscode.window.activeTextEditor || lastActiveEditor;
		let contextSnippet = '';
		
		if (editor) {
			const selection = editor.document.getText(editor.selection);
			if (selection) {
				contextSnippet = `\n\n[SELECTED CODE]:\n\`\`\`\n${selection}\n\`\`\``;
			} else {
				const text = editor.document.getText();
				const truncated = text.split('\n').slice(0, 200).join('\n');
				contextSnippet = `\n\n[FILE CONTENT (${editor.document.fileName})]:\n\`\`\`\n${truncated}\n\`\`\``;
			}
		}

		// --- Project Map (Only send if they ask about the project to save memory) ---
		let projectMap = '';
		const workspaceFolders = vscode.workspace.workspaceFolders;
		const isProjectWide = userMessage.toLowerCase().includes('project') || userMessage.toLowerCase().includes('files');
		
		if (workspaceFolders && isProjectWide) {
			const files = await vscode.workspace.findFiles('**/*', '**/node_modules/**', 40);
			if (files.length > 0) {
				const fileList = files.map(f => vscode.workspace.asRelativePath(f)).join('\n');
				projectMap = `\n\n[PROJECT STRUCTURE]:\n${fileList}`;
			}
		}

		const { url, model, apiKey } = getAIConfig();
		
		try {
			const headers: Record<string, string> = { 'Content-Type': 'application/json' };
			if (apiKey) { headers['Authorization'] = `Bearer ${apiKey}`; }

			const systemPrompt = `You are a CODE GENERATOR. DO NOT CHAT. DO NOT DESCRIBE. DO NOT ASK FOR IMAGES.
Your ONLY job is to output code blocks with triple backticks.
If the user asks for a change, find the relevant code in the provided context and rewrite it.
Always use this format:
file: path/to/file.ext
\`\`\`language
// your improved code here
\`\`\``;

			let aiResponse = '';
			let currentMessages = [
				{ role: 'system', content: systemPrompt },
				{ role: 'user', content: userMessage + contextSnippet + projectMap }
			];

			// --- FIRST PASS: INITIAL THINKING ---
			const res = await fetch(url, {
				method: 'POST',
				headers,
				body: JSON.stringify({ model, messages: currentMessages, stream: true }),
			});

			if (!res.ok) { throw new Error(`API Error: ${res.status}`); }
			
			const reader = res.body?.getReader();
			const decoder = new TextDecoder();
			if (reader) {
				while (true) {
					const { done, value } = await reader.read();
					if (done) break;
					const chunk = decoder.decode(value, { stream: true });
					const lines = chunk.split('\n');
					for (const line of lines) {
						if (!line.trim() || line.includes('[DONE]')) continue;
						try {
							const json = JSON.parse(line.replace(/^data: /, ''));
							const content = json.choices?.[0]?.delta?.content || json.message?.content || "";
							aiResponse += content;
							provider.postMessage({ type: 'updateAiResponse', value: aiResponse });
						} catch (e) {}
					}
				}
			}

			// --- SMART AUTO-CONTEXT: DID THE AI ASK FOR A FILE? ---
			const fileMatch = aiResponse.match(/`([^`]+\\.[a-z0-9]+)`/i);
			if (fileMatch && (aiResponse.includes('need to see') || aiResponse.includes('analyze'))) {
				const requestedPath = fileMatch[1];
				provider.postMessage({ type: 'updateAiResponse', value: `🔍 *Reading ${requestedPath}...*` });
				
				const workspaceFolders = vscode.workspace.workspaceFolders;
				if (workspaceFolders) {
					try {
						const fileUri = vscode.Uri.joinPath(workspaceFolders[0].uri, requestedPath);
						const content = await vscode.workspace.fs.readFile(fileUri);
						const fileText = new TextDecoder().decode(content);
						
						currentMessages.push({ role: 'assistant', content: aiResponse });
						currentMessages.push({ role: 'user', content: `Here is the content of ${requestedPath}:\n\`\`\`\n${fileText.split('\n').slice(0, 300).join('\n')}\n\`\`\`` });

						// --- SECOND PASS: FINAL ANSWER ---
						let secondPassText = '';
						const res2 = await fetch(url, {
							method: 'POST',
							headers,
							body: JSON.stringify({ model, messages: currentMessages, stream: true }),
						});

						const reader2 = res2.body?.getReader();
						if (reader2) {
							while (true) {
								const { done, value } = await reader2.read();
								if (done) break;
								const chunk = decoder.decode(value, { stream: true });
								const lines = chunk.split('\n');
								for (const line of lines) {
									if (!line.trim() || line.includes('[DONE]')) continue;
									try {
										const json = JSON.parse(line.replace(/^data: /, ''));
										const content = json.choices?.[0]?.delta?.content || json.message?.content || "";
										secondPassText += content;
										provider.postMessage({ type: 'updateAiResponse', value: secondPassText });
									} catch (e) {}
								}
							}
						}
					} catch (e) {
						provider.postMessage({ type: 'updateAiResponse', value: `❌ Could not read \`${requestedPath}\`.` });
					}
				}
			}
			// NO LONGER CALLING addAiResponse here to avoid the double-message!

		} catch (err: any) {
			provider.postMessage({ type: 'addAiResponse', value: `⚠️ Error: ${err.message}` });
		}
	});

	// --- Command: Apply Code ---
	const applyCodeDisposable = vscode.commands.registerCommand('ai.applyCode', async (code: string, filePath?: string) => {
		if (filePath) {
			const workspaceFolders = vscode.workspace.workspaceFolders;
			if (workspaceFolders) {
				const fullPath = vscode.Uri.joinPath(workspaceFolders[0].uri, filePath);
				const encoder = new TextEncoder();
				await vscode.workspace.fs.writeFile(fullPath, encoder.encode(code));
				vscode.window.showInformationMessage(`[fax-ai] Written to ${filePath}`);
				return;
			}
		}

		const editor = vscode.window.activeTextEditor || lastActiveEditor;
		if (!editor) {
			vscode.window.showErrorMessage('[fax-ai] No active editor found.');
			return;
		}

		editor.edit(editBuilder => {
			if (!editor.selection.isEmpty) {
				editBuilder.replace(editor.selection, code);
			} else {
				editBuilder.insert(editor.selection.active, code);
			}
		});
		vscode.window.showInformationMessage('[fax-ai] Code applied!');
	});

	// --- Quick Action Commands (Explain, Fix, etc.) ---
	const quickActions: Record<string, string> = {
		'ai.explainCode': 'Explain this code:',
		'ai.fixCode': 'Find bugs and fix this code:',
		'ai.addComments': 'Add helpful comments to this code:',
		'ai.genTests': 'Generate unit tests for this code:'
	};

	Object.entries(quickActions).forEach(([cmd, prompt]) => {
		context.subscriptions.push(vscode.commands.registerCommand(cmd, async () => {
			await vscode.commands.executeCommand('workbench.view.extension.fax-ai-sidebar');
			const editor = vscode.window.activeTextEditor || lastActiveEditor;
			const selection = editor?.document.getText(editor.selection) || '';
			
			// Just trigger the chat processing
			await vscode.commands.executeCommand('ai.processChat', prompt);
		}));
	});

	// --- List Models ---
	const listModelsDisposable = vscode.commands.registerCommand('ai.listModels', async () => {
		const { url, apiKey } = getAIConfig();
		const listUrl = url.replace(/\/chat\/completions$/, '/models').replace(/\/api\/v1\/chat\/completions$/, '/api/v1/models');
		
		try {
			const res = await fetch(listUrl, { 
				headers: apiKey ? { 'Authorization': `Bearer ${apiKey}` } : {},
				signal: AbortSignal.timeout(10000) 
			});
			const data: any = await res.json();
			const models = (data.data || data || []).map((m: any) => m.id || m.name || m).filter((m: any) => typeof m === 'string');
			const selected = await vscode.window.showQuickPick(models, { title: 'Select fax-ai Model' });
			if (selected) {
				await vscode.workspace.getConfiguration('faxAi').update('model', selected, vscode.ConfigurationTarget.Global);
				vscode.window.showInformationMessage(`[fax-ai] Model set to ${selected}`);
			}
		} catch (err: any) {
			vscode.window.showErrorMessage(`[fax-ai] Failed to list models: ${err.message}`);
		}
	});

	// --- Command: Edit with AI (Direct Replace) ---
	const editCodeDisposable = vscode.commands.registerCommand('ai.editCode', async () => {
		const editor = vscode.window.activeTextEditor || lastActiveEditor;
		if (!editor) return;

		const selection = editor.document.getText(editor.selection);
		const instruction = await vscode.window.showInputBox({
			placeHolder: "How should I change this code?",
			prompt: "Describe the changes you want to make"
		});

		if (!instruction) return;

		const { url, model, apiKey } = getAIConfig();
		
		await vscode.window.withProgress({
			location: vscode.ProgressLocation.Notification,
			title: "[fax-ai] Rewriting code...",
			cancellable: false
		}, async () => {
			try {
				const systemPrompt = "You are a code rewrite assistant. ONLY return the new code. No explanation, no talk, no backticks unless they are part of the code.";
				const res = await fetch(url, {
					method: 'POST',
					headers: apiKey ? { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' } : { 'Content-Type': 'application/json' },
					body: JSON.stringify({
						model,
						messages: [
							{ role: 'system', content: systemPrompt },
							{ role: 'user', content: `Rewrite this code: ${selection}\n\nInstruction: ${instruction}` }
						],
						stream: false
					})
				});

				const data: any = await res.json();
				const newCode = data?.choices?.[0]?.message?.content || data?.response || "";
				
				if (newCode) {
					editor.edit(eb => eb.replace(editor.selection, newCode.trim()));
					vscode.window.showInformationMessage("[fax-ai] Code rewritten!");
				}
			} catch (err: any) {
				vscode.window.showErrorMessage(`Edit failed: ${err.message}`);
			}
		});
	});

	context.subscriptions.push(processChatDisposable, applyCodeDisposable, listModelsDisposable, editCodeDisposable);
}

export function deactivate() {}