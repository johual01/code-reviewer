const vscode = require('vscode');

/**
 * @param {vscode.ExtensionContext} context
 */
function activate(context) {
	console.log('Congratulations, your extension "code-reviewer" is now active!');

	const statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 1);
	statusBarItem.text = '$(rocket) Code Reviewer';
	statusBarItem.tooltip = 'Ejecutar Code Reviewer';
	statusBarItem.command = 'code-reviewer.review';
	statusBarItem.show();
	context.subscriptions.push(statusBarItem);

	const disposable = vscode.commands.registerCommand('code-reviewer.review', async () => {
		const editor = vscode.window.activeTextEditor;
		if (!editor) {
			vscode.window.showInformationMessage('No se encontró el editor para el archivo guardado.');
			return;
		}
		const content = editor.document.getText();
		const diagnostics = [];
		const lines = content.split(/\r?\n/);
		lines.forEach((line, idx) => {
			if (line.includes('Generator is already executing.')) {
				diagnostics.push({
					line: idx,
					message: 'Está mal escrito'
				});
			}
		});
		console.log('Diagnostics:', diagnostics);

		// Crear y mostrar diagnostics en el editor y mostrar mensaje para cada diagnóstico
		const diagnosticCollection = vscode.languages.createDiagnosticCollection('code-reviewer');
		const uri = editor.document.uri;
		const fileDiagnostics = diagnostics.map(d => {
			const diag = new vscode.Diagnostic(
				new vscode.Range(d.line, 0, d.line, editor.document.lineAt(d.line).text.length),
				d.message,
				vscode.DiagnosticSeverity.Error
			);
			diag.source = 'code-reviewer';
			diag.code = 'custom';
			return diag;
		});
		diagnosticCollection.set(uri, fileDiagnostics);
		context.subscriptions.push(diagnosticCollection);

		// Mostrar mensaje informativo en la línea de cada error encontrado
		for (const diag of fileDiagnostics) {
			await vscode.window.showTextDocument(editor.document, { preview: false });
			const pos = new vscode.Position(diag.range.start.line, diag.range.start.character);
			editor.selection = new vscode.Selection(pos, pos);
			vscode.window.showInformationMessage(`Línea ${diag.range.start.line + 1}: ${diag.message}`);
		}

		// Mostrar comentarios tipo "review" en el editor, como en la extensión de PRs de GitHub
		const commentController = vscode.comments.createCommentController('code-reviewer', 'Code Reviewer');
		context.subscriptions.push(commentController);
		commentController.commentingRangeProvider = {
			provideCommentingRanges: (document, token) => {
				return fileDiagnostics.map(d => new vscode.Range(d.range.start.line, 0, d.range.start.line, document.lineAt(d.range.start.line).text.length));
			}
		};
		// Mantener una referencia global a los threads creados para poder limpiarlos
		if (!globalThis._codeReviewerThreads) {
			globalThis._codeReviewerThreads = [];
		}
		// Limpiar threads anteriores
		for (const thread of globalThis._codeReviewerThreads) {
			thread.dispose();
		}
		globalThis._codeReviewerThreads = [];

		// Crear un thread de comentario por cada diagnóstico, solo como info, sin reply
		for (const diag of fileDiagnostics) {
			const markdown = new vscode.MarkdownString();
			markdown.appendMarkdown(`---\n`);
			markdown.appendMarkdown(`${diag.message}\n`);
			markdown.appendMarkdown(`---`);
			const thread = commentController.createCommentThread(
				uri,
				new vscode.Range(diag.range.start.line, 0, diag.range.start.line, editor.document.lineAt(diag.range.start.line).text.length),
				[
					{
						body: markdown,
						author: { name: '🤖 Code Reviewer' },
						mode: vscode.CommentMode.Preview
					}
				]
			);
			thread.collapsibleState = vscode.CommentThreadCollapsibleState.Expanded;
			thread.canReply = false;
			globalThis._codeReviewerThreads.push(thread);
		}

		if (diagnostics.length === 0) {
			vscode.window.showInformationMessage('Tu código está perfecto!');
		} else {
			vscode.window.showInformationMessage('Se encontraron errores en tu código. Verifica los comentarios en el editor antes de continuar.');
		}
	});
	context.subscriptions.push(disposable);

	const saveListener = vscode.workspace.onDidSaveTextDocument(async (document) => {
		const now = Date.now();
		const ext = document.fileName.split('.').pop();
		if ((ext === 'js' || ext === 'ts')) {
			if (now < ignoreUntil || pendingPrompt) {
				return;
			}
			pendingPrompt = true;
			const result = await vscode.window.showInformationMessage(
				'¿Quieres que le realicemos una revisión al código que acabas de guardar?',
				'Sí', 'No'
			);
			pendingPrompt = false;
			if (result === 'Sí') {
				vscode.commands.executeCommand('code-reviewer.review');
			} else if (result === 'No') {
				ignoreUntil = Date.now() + 60 * 1000;
			}
		}
	});
	context.subscriptions.push(saveListener);
}

function deactivate() {}

module.exports = {
	activate,
	deactivate
}

let ignoreUntil = 0;
let pendingPrompt = false;
