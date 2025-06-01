const vscode = require('vscode');
const Diagnostics = require('./diagnostic');
const { createComments } = require('./comment');
const path = require('path');
const fs = require('fs');
const { createContext, updateConfiguration } = require('./service');

const diagnosticsInstance = new Diagnostics();

/**
 * @param {vscode.ExtensionContext} context
 */
async function activate(context) {
	console.log('Congratulations, your extension "code-reviewer" is now active!');

	const statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 1);
	statusBarItem.text = '$(rocket) Code Reviewer';
	statusBarItem.tooltip = 'Ejecutar Code Reviewer';
	statusBarItem.command = 'code-reviewer.review';
	statusBarItem.show();
	context.subscriptions.push(statusBarItem);

	const diagnosticCollection = vscode.languages.createDiagnosticCollection('codeReviewer');

	// Ejecutar config al iniciar la extensión
	await vscode.commands.executeCommand('code-reviewer.config', { reason: 'startup' });

	const config = vscode.commands.registerCommand('code-reviewer.config', async (args = {}) => {
		const workspaceFolders = vscode.workspace.workspaceFolders;
		if (!workspaceFolders || workspaceFolders.length === 0) {
			vscode.window.showErrorMessage('No se encontró una carpeta de trabajo abierta.');
			return;
		}
		const baseFolder = workspaceFolders[0].uri.fsPath;
		const configPath = path.join(baseFolder, 'config_cr.yml');

		try {
			if (args.reason === 'startup') {
				await createContext(configPath);
			} else {
				await updateConfiguration(configPath)
			}
		} catch (err) {
			vscode.window.showErrorMessage('No se pudo leer config_cr.yml en la carpeta base.');
		}
	});
	context.subscriptions.push(config);

	const disposable = vscode.commands.registerCommand('code-reviewer.review', async () => {
		const editor = vscode.window.activeTextEditor;
		if (!editor) {
			vscode.window.showInformationMessage('No se encontró el editor para el archivo guardado.');
			return;
		}
		const fileName = editor.document.fileName;
		const ext = fileName.split('.').pop();
		if (ext !== 'js' && ext !== 'ts') {
			vscode.window.showInformationMessage('Solo se pueden revisar archivos JavaScript o TypeScript.');
			return;
		}
		const file = editor.document.fileName;
		const diagnostics = await diagnosticsInstance.generateDiagnostics(file);
		console.log('Diagnostics:', diagnostics);

		await createComments(editor, diagnosticsInstance.getCurrentDiagnostics(), diagnosticCollection);

		if (diagnostics.length === 0) {
			vscode.window.showInformationMessage('Tu código está perfecto!');
		} else {
			vscode.window.showInformationMessage('Se encontraron errores en tu código. Verifica los comentarios en el editor antes de continuar.');
		}
	});
	context.subscriptions.push(disposable);

	const resolveDiagnostic = vscode.commands.registerCommand('code-reviewer.resolveDiagnostic', async (id) => {
		const diagnostic = diagnosticsInstance.findById(id);
		if (diagnostic) {
			diagnosticsInstance.resolveDiagnostic(id);
			vscode.window.showInformationMessage(`Se resolvió el error: ${diagnostic.message}`);
			const editor = vscode.window.activeTextEditor;
			await createComments(editor, diagnosticsInstance.getCurrentDiagnostics(), diagnosticCollection);
		} else {
			vscode.window.showErrorMessage('Diagnostic not found.');
		}
	});
	context.subscriptions.push(resolveDiagnostic);

	const saveListener = vscode.workspace.onDidSaveTextDocument(async (document) => {
		const now = Date.now();
		const ext = document.fileName.split('.').pop();
		const fileName = path.basename(document.fileName);

		if (fileName === 'config_cr.yml') {
			await vscode.commands.executeCommand('code-reviewer.config', { reason: 'configUpdate' });
			return;
		}

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
