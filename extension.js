const vscode = require('vscode');
const Diagnostics = require('./diagnostic');
const { createComments } = require('./comment');
const path = require('path');
const fs = require('fs');
const { createSession, updateConfiguration, analyzeFile, convertIssuesToDiagnostics, authentication } = require('./service');

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

	// Ejecutar config al iniciar la extensión (de forma no bloqueante)
	vscode.commands.executeCommand('code-reviewer.config', { reason: 'startup' })
		.then(() => {
			console.log('Configuración inicial completada');
		}, err => {
			console.log('Error inicial en configuración (no crítico):', err.message);
		});

	const config = vscode.commands.registerCommand('code-reviewer.config', async (args = {}) => {
		const workspaceFolders = vscode.workspace.workspaceFolders;
		if (!workspaceFolders || workspaceFolders.length === 0) {
			vscode.window.showErrorMessage('No se encontró una carpeta de trabajo abierta.');
			return;
		}
		const baseFolder = workspaceFolders[0].uri.fsPath;
		const configPath = path.join(baseFolder, 'crconfig.yml');

		try {
			if (args.reason === 'startup') {
				// Crear sesión al iniciar (modo silencioso)
				await createSession();
				console.log('Sesión de Code Reviewer iniciada exitosamente.');
			} else {
				// Leer configuración desde el archivo YAML y actualizar reglas
				// Por ahora, usamos reglas por defecto (en el futuro se puede parsear el YAML)
				const defaultRules = [
					"AIRBNB_TYPES",
					"AIRBNB_VARS",
					"AIRBNB_SCOPE",
					"AIRBNB_OBJECTS",
					"AIRBNB_ARRAYS",
					"AIRBNB_DESTRUCT",
					"AIRBNB_STRINGS",
					"AIRBNB_FUNCS",
					"AIRBNB_CLASSES",
					"AIRBNB_MODULES",
					"AIRBNB_ITER",
					"AIRBNB_ACCESS",
					"AIRBNB_SINGLE_DECL",
					"AIRBNB_UNARY",
					"AIRBNB_COMPARE",
					"AIRBNB_CONTROL",
					"AIRBNB_DOCS",
					"AIRBNB_FORMAT",
					"AIRBNB_COMMAS",
					"AIRBNB_SEMICOLON",
					"AIRBNB_NAMES",
					"AIRBNB_BOOL",
					"AIRBNB_STD",
					"AIRBNB_PERF",
					"AIRBNB_UNUSED",
					"AIRBNB_HOIST",
					
					"CLEAN_CLARITY",
					"CLEAN_NAMES",
					"CLEAN_SMALL_FUNCS",
					"CLEAN_COMMENTS",
					"CLEAN_ERRORS",
					
					"SOLID_SRP_A",
					"SOLID_SRP_B",
					"SOLID_SRP_C",
					"SOLID_OCP_A",
					"SOLID_OCP_B",
					"SOLID_OCP_C",
					"SOLID_LSP_A",
					"SOLID_LSP_B",
					"SOLID_LSP_C",
					"SOLID_ISP_A",
					"SOLID_ISP_B",
					"SOLID_ISP_C",
					"SOLID_DIP_A",
					"SOLID_DIP_B",
					"SOLID_DIP_C",
					"SOLID_DIP_D",
					"SOLID_DIP_E",
					
					"DRY",
					"KISS",
					"YAGNI",
					"TDA"
				];
				
				if (fs.existsSync(configPath)) {
					const configContent = fs.readFileSync(configPath, 'utf8');
					// TODO: parsear el YAML para extraer las reglas personalizadas
					console.log('Config file found, using default rules for now:', configContent);
				} else {
					console.log('Config file not found, using default rules');
				}
				
				await updateConfiguration(defaultRules, args.reason === 'startup' ? 'create' : 'update');
				vscode.window.showInformationMessage('Configuración actualizada exitosamente.');
			}
		} catch (err) {
			console.error('Error en configuración:', err);
			if (args.reason !== 'startup') {
				// Solo mostrar error al usuario si no es el startup
				vscode.window.showErrorMessage(`Error en configuración: ${err.message}`);
			}
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

		if (!authentication.token) {
			try {
				await vscode.window.withProgress(
					{
						location: vscode.ProgressLocation.Notification,
						title: 'Code Reviewer',
						cancellable: false,
					},
					async (progress, _) => {
						let currentProgress = 0;
						let sessionCompleted = false;
						
						// Ejecutar createSession en paralelo
						const sessionPromise = createSession().then(() => {
							sessionCompleted = true;
						});
						
						// Actualizar progreso cada 200ms mientras la sesión se crea
						const progressInterval = setInterval(() => {
							if (!sessionCompleted && currentProgress < 90) {
								currentProgress += Math.random() * 15; // Incremento aleatorio entre 0-15
								if (currentProgress > 90) currentProgress = 90;
								
								let message = 'Creando sesión...';
								if (currentProgress < 30) {
									message = 'Iniciando conexión...';
								} else if (currentProgress < 60) {
									message = 'Autenticando...';
								} else if (currentProgress < 90) {
									message = 'Configurando sesión...';
								}
								
								progress.report({ increment: currentProgress, message });
							}
						}, 100);
						
						// Esperar a que termine la sesión
						await sessionPromise;
						clearInterval(progressInterval);
						
						// Completar al 100%
						progress.report({ increment: 100, message: 'Sesión creada exitosamente' });
						await new Promise(resolve => setTimeout(resolve, 300)); // Pequeña pausa para mostrar el 100%
					}
				);
			} catch (error) {
				vscode.window.showErrorMessage(`Error al crear sesión: ${error.message}`);
				return;
			}
		}

		try {
			// Mostrar barra de progreso durante el análisis
			await vscode.window.withProgress(
				{
					location: vscode.ProgressLocation.Notification,
					title: 'Code Reviewer',
					cancellable: false,
				},
				async (progress, _) => {
					let currentProgress = 0;
					let analysisCompleted = false;
					let diagnostics = [];
					let analysisResult = {};
					
					// Ejecutar análisis en paralelo
					const analysisPromise = analyzeFile(fileName).then((result) => {
						analysisResult = result;
						console.log('Analysis result:', analysisResult);
						
						// Convertir issues a diagnósticos
						diagnostics = convertIssuesToDiagnostics(analysisResult.issues || []);
						diagnosticsInstance.setDiagnostics(diagnostics);
						
						analysisCompleted = true;
					});
					
					// Actualizar progreso cada 150ms mientras se analiza
					const progressInterval = setInterval(() => {
						if (!analysisCompleted && currentProgress < 85) {
							currentProgress += Math.random() * 12; // Incremento aleatorio entre 0-12
							if (currentProgress > 85) currentProgress = 85;
							
							let message = 'Analizando código...';
							if (currentProgress < 20) {
								message = 'Leyendo archivo...';
							} else if (currentProgress < 40) {
								message = 'Aplicando reglas de estilo...';
							} else if (currentProgress < 65) {
								message = 'Evaluando complejidad...';
							} else if (currentProgress < 85) {
								message = 'Generando sugerencias...';
							}
							
							progress.report({ increment: currentProgress, message });
						}
					}, 150);
					
					// Esperar a que termine el análisis
					await analysisPromise;
					clearInterval(progressInterval);
					
					// Crear comentarios
					progress.report({ increment: 90, message: 'Creando comentarios en el editor...' });
					await createComments(editor, diagnostics, diagnosticCollection);
					
					// Completar al 100%
					progress.report({ increment: 100, message: 'Análisis completado' });
					await new Promise(resolve => setTimeout(resolve, 200)); // Pequeña pausa para mostrar el 100%
					
					// Mostrar resumen después del progreso
					if (diagnostics.length === 0) {
						vscode.window.showInformationMessage('¡Tu código está perfecto!');
					} else {
						const evaluation = analysisResult.evaluation;
						const message = `Análisis completado: ${diagnostics.length} problemas encontrados. ` +
									   `Puntuación de estilo: ${evaluation?.styleScore || 'N/A'}/100. ` +
									   `Complejidad: ${evaluation?.complexity || 'N/A'}.`;
						
						const result = await vscode.window.showInformationMessage(message, 'Ver Resumen Completo');
						
						if (result === 'Ver Resumen Completo') {
							showAnalysisPanel(context, analysisResult);
						}
					}
				}
			);
		} catch (error) {
			console.error('Error during analysis:', error);
			vscode.window.showErrorMessage(`Error durante el análisis: ${error.message}`);
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

		if (fileName === 'crconfig.yml') {
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

function showAnalysisPanel(context, analysisResult) {
	// Crear el panel webview
	const panel = vscode.window.createWebviewPanel(
		'codeReviewerAnalysis',
		'Code Reviewer - Análisis Completo',
		vscode.ViewColumn.Beside,
		{
			enableScripts: true,
			retainContextWhenHidden: true
		}
	);

	// Generar el contenido HTML del panel
	const htmlContent = generateAnalysisHTML(analysisResult);
	panel.webview.html = htmlContent;

	// Manejar mensajes del webview
	panel.webview.onDidReceiveMessage(
		message => {
			switch (message.command) {
				case 'openFile':
					// Abrir archivo en el editor en la línea específica
					vscode.workspace.openTextDocument(message.filePath).then(doc => {
						vscode.window.showTextDocument(doc).then(editor => {
							const position = new vscode.Position(message.line - 1, 0);
							editor.selection = new vscode.Selection(position, position);
							editor.revealRange(new vscode.Range(position, position));
						});
					});
					break;
			}
		},
		undefined,
		context.subscriptions
	);
}

function generateAnalysisHTML(analysisResult) {
	const evaluation = analysisResult.evaluation || {};
	const issues = analysisResult.issues || [];
	
	// Convertir markdown a HTML básico si está disponible
	let markdownContent = '';
	if (analysisResult.fullSuggestionMarkdown) {
		markdownContent = analysisResult.fullSuggestionMarkdown
			// Primero procesar bloques de código (``` o `javascript)
			.replace(/```[\s\S]*?```/g, (match) => {
				// Extraer el contenido del bloque de código
				const codeContent = match.replace(/```\w*\n?/g, '').replace(/```$/g, '');
				return `<pre><code>${codeContent.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</code></pre>`;
			})
			// Luego procesar código inline (single backticks)
			.replace(/`([^`]+)`/g, '<code>$1</code>')
			// Procesar encabezados
			.replace(/### (.*?)(\n|$)/g, '<h3>$1</h3>')
			.replace(/## (.*?)(\n|$)/g, '<h2>$1</h2>')
			.replace(/# (.*?)(\n|$)/g, '<h1>$1</h1>')
			// Procesar texto en negrita y cursiva
			.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
			.replace(/\*(.*?)\*/g, '<em>$1</em>')
			// Procesar separadores
			.replace(/---/g, '<hr>')
			// Convertir saltos de línea
			.replace(/\n/g, '<br>');
	}

	return `
		<!DOCTYPE html>
		<html lang="es">
		<head>
			<meta charset="UTF-8">
			<meta name="viewport" content="width=device-width, initial-scale=1.0">
			<title>Análisis de Código</title>
			<style>
				body {
					font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', sans-serif;
					margin: 0;
					padding: 20px;
					background-color: var(--vscode-editor-background);
					color: var(--vscode-editor-foreground);
					line-height: 1.6;
				}
				.header {
					border-bottom: 2px solid var(--vscode-panel-border);
					padding-bottom: 20px;
					margin-bottom: 20px;
				}
				.score-card {
					display: flex;
					gap: 20px;
					margin: 20px 0;
				}
				.score-item {
					background: var(--vscode-editor-inactiveSelectionBackground);
					padding: 15px;
					border-radius: 8px;
					text-align: center;
					flex: 1;
				}
				.score-value {
					font-size: 2em;
					font-weight: bold;
					color: var(--vscode-textLink-foreground);
				}
				.issue {
					background: var(--vscode-editor-inactiveSelectionBackground);
					border-left: 4px solid;
					margin: 15px 0;
					padding: 15px;
					border-radius: 0 8px 8px 0;
				}
				.issue.error { border-left-color: #f14c4c; }
				.issue.warning { border-left-color: #ff8c00; }
				.issue.suggestion { border-left-color: #0099ff; }
				.issue-header {
					display: flex;
					align-items: center;
					gap: 10px;
					margin-bottom: 10px;
				}
				.issue-title {
					font-weight: bold;
					font-size: 1.1em;
				}
				.issue-location {
					background: var(--vscode-badge-background);
					color: var(--vscode-badge-foreground);
					padding: 2px 6px;
					border-radius: 4px;
					font-size: 0.8em;
					cursor: pointer;
				}
				.code-block {
					background: var(--vscode-textCodeBlock-background);
					border: 1px solid var(--vscode-panel-border);
					border-radius: 4px;
					padding: 10px;
					margin: 10px 0;
					font-family: 'Courier New', monospace;
					overflow-x: auto;
				}
				.code-before { border-left: 3px solid #f14c4c; }
				.code-after { border-left: 3px solid #00ff00; }
				.markdown-content {
					background: var(--vscode-textCodeBlock-background);
					border: 1px solid var(--vscode-panel-border);
					border-radius: 8px;
					padding: 20px;
					margin: 20px 0;
				}
				.section {
					margin: 30px 0;
				}
				.section h2 {
					color: var(--vscode-textLink-foreground);
					border-bottom: 1px solid var(--vscode-panel-border);
					padding-bottom: 5px;
				}
			</style>
			<script>
				const vscode = acquireVsCodeApi();
				
				function openFile(line) {
					vscode.postMessage({
						command: 'openFile',
						line: parseInt(line)
					});
				}
			</script>
		</head>
		<body>
			<div class="header">
				<h1>📊 Análisis de Código Completo</h1>
			</div>

			<div class="section">
				<h2>📈 Evaluación</h2>
				<div class="score-card">
					<div class="score-item">
						<div class="score-value">${evaluation.styleScore || 'N/A'}</div>
						<div>Puntuación de Estilo</div>
					</div>
					<div class="score-item">
						<div class="score-value">${evaluation.complexity || 'N/A'}</div>
						<div>Complejidad</div>
					</div>
					<div class="score-item">
						<div class="score-value">${issues.length}</div>
						<div>Problemas</div>
					</div>
				</div>
			</div>

			${markdownContent ? `
			<div class="section">
				<div class="markdown-content">
					${markdownContent}
				</div>
			</div>
			` : ''}

		</body>
		</html>
	`;
}

module.exports = {
	activate
}

let ignoreUntil = 0;
let pendingPrompt = false;
