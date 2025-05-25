const vscode = require('vscode');
const diagnosticProvider = require('./diagnostic');
const commentProvider = require('./comment');
const { getDiagnostics } = diagnosticProvider
const { createComments } = commentProvider

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
		const lines = content.split(/\r?\n/);
		const diagnostics = await getDiagnostics(lines);
		console.log('Diagnostics:', diagnostics);

		await createComments(editor, diagnostics);

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
				ignoreUntil = Date.now() + 5 * 60 * 1000;
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
