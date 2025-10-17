const vscode = require('vscode');
const Diagnostics = require('./diagnostic');
const { createComments } = require('./comment');
const path = require('path');
const fs = require('fs');
const showdown = require('showdown');
const { 
	createSession, 
	updateConfiguration,
	analyzeFile, 
	convertIssuesToDiagnostics, 
	handleAuthError, 
	authentication, 
	detectLanguageFromFile, 
	EXTENSION_TO_LANGUAGE,
	generateDetailedSuggestions,
} = require('./service');

// Simple YAML parser para las reglas (evita dependencias externas)
function parseYAMLRules(yamlContent) {
	const rules = [];
	const lines = yamlContent.split('\n');
	let inRulesSection = false;
	
	for (const line of lines) {
		const trimmedLine = line.trim();
		
		// Detectar el inicio de la sección rules
		if (trimmedLine === 'rules:') {
			inRulesSection = true;
			continue;
		}
		
		// Si estamos en la sección rules y la línea está indentada
		if (inRulesSection && line.startsWith('  ') && trimmedLine.includes(':')) {
			const [ruleName, ruleValue] = trimmedLine.split(':').map(s => s.trim());
			// Agregar la regla si está marcada como true
			if (ruleValue === 'true') {
				rules.push(ruleName);
			}
		} 
		// Si encontramos una línea que no está indentada y no está vacía, salir de la sección rules
		else if (inRulesSection && !line.startsWith('  ') && trimmedLine !== '' && !trimmedLine.startsWith('#')) {
			break;
		}
	}
	
	console.log(`Parser YAML: Encontradas ${rules.length} reglas activas:`, rules.slice(0, 5), rules.length > 5 ? '...' : '');
	return rules;
}

const diagnosticsInstance = new Diagnostics();

// Panel compartido para análisis
let sharedAnalysisPanel = null;

// Estado de peticiones activas
let isAnalysisInProgress = false;
let isDetailedSuggestionsInProgress = false;

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
			console.log('🚀 Code Reviewer iniciado correctamente. La extensión está lista para analizar código en múltiples lenguajes.');
			vscode.window.showInformationMessage('Code Reviewer listo para revisar tu código 🎯', { modal: false });
		}, err => {
			console.log('⚠️ Error inicial en configuración (no crítico):', err.message);
		});

	const config = vscode.commands.registerCommand('code-reviewer.config', async (args = {}) => {
		const workspaceFolders = vscode.workspace.workspaceFolders;
		if (!workspaceFolders || workspaceFolders.length === 0) {
			vscode.window.showErrorMessage('No se encontró una carpeta de trabajo abierta.');
			return;
		}
		const baseFolder = workspaceFolders[0].uri.fsPath;
		const configPath = path.join(baseFolder, 'crconfig.yml');
		const exampleConfigPath = path.join(baseFolder, 'crconfig-example.yml');

		try {
			if (args.reason === 'startup') {
				// Crear sesión al iniciar (modo silencioso)
				await createSession();
				console.log('Sesión de Code Reviewer iniciada exitosamente.');
			} else {
				let rules = [];
				
				// Intentar leer el archivo de configuración del usuario primero
				if (fs.existsSync(configPath)) {
					try {
						const configContent = fs.readFileSync(configPath, 'utf8');
						rules = parseYAMLRules(configContent);
						console.log('Config file found, parsed rules:', rules);
					} catch (parseError) {
						console.error('Error parsing user config:', parseError);
						vscode.window.showWarningMessage('Error al parsear crconfig.yml, usando configuración de ejemplo.');
					}
				}
				
				// Si no hay configuración del usuario o falló el parsing, usar el ejemplo
				if (rules.length === 0 && fs.existsSync(exampleConfigPath)) {
					try {
						const exampleContent = fs.readFileSync(exampleConfigPath, 'utf8');
						rules = parseYAMLRules(exampleContent);
						console.log('Using example config, parsed rules:', rules);
					} catch (parseError) {
						console.error('Error parsing example config:', parseError);
					}
				}
				
				// Si aún no hay reglas, usar las por defecto como fallback
				if (rules.length === 0) {
					rules = [
						"AIRBNB_TYPES", "AIRBNB_VARS", "AIRBNB_SCOPE", "AIRBNB_OBJECTS",
						"AIRBNB_ARRAYS", "AIRBNB_DESTRUCT", "AIRBNB_STRINGS", "AIRBNB_FUNCS",
						"AIRBNB_CLASSES", "AIRBNB_MODULES", "AIRBNB_ITER", "AIRBNB_ACCESS",
						"AIRBNB_SINGLE_DECL", "AIRBNB_UNARY", "AIRBNB_COMPARE", "AIRBNB_CONTROL",
						"AIRBNB_DOCS", "AIRBNB_FORMAT", "AIRBNB_COMMAS", "AIRBNB_SEMICOLON",
						"AIRBNB_NAMES", "AIRBNB_BOOL", "AIRBNB_STD", "AIRBNB_PERF",
						"AIRBNB_UNUSED", "AIRBNB_HOIST", "CLEAN_CLARITY", "CLEAN_NAMES",
						"CLEAN_SMALL_FUNCS", "CLEAN_COMMENTS", "CLEAN_ERRORS",
						"SOLID_SRP_A", "SOLID_SRP_B", "SOLID_SRP_C", "SOLID_OCP_A",
						"SOLID_OCP_B", "SOLID_OCP_C", "SOLID_LSP_A", "SOLID_LSP_B",
						"SOLID_LSP_C", "SOLID_ISP_A", "SOLID_ISP_B", "SOLID_ISP_C",
						"SOLID_DIP_A", "SOLID_DIP_B", "SOLID_DIP_C", "SOLID_DIP_D",
						"SOLID_DIP_E", "DRY", "KISS", "YAGNI", "TDA"
					];
					console.log('Using fallback default rules');
				}
				
				await updateConfiguration(rules, args.reason === 'startup' ? 'create' : 'update');
				vscode.window.showInformationMessage(`Configuración actualizada con ${rules.length} reglas.`);
			}
		} catch (err) {
			console.error('Error en configuración:', err);
			if (args.reason !== 'startup') {
				// Detectar si el error fue debido a reautenticación automática
				if (err.message && err.message.includes('Error de autenticación')) {
					if (authentication.token) {
						vscode.window.showInformationMessage('Sesión renovada automáticamente. Configuración actualizada.');
					} else {
						vscode.window.showErrorMessage('Error de autenticación en configuración. Por favor, intente nuevamente.');
					}
				} else {
					// Extraer mensaje específico del servidor
					let errMsg = 'Error desconocido';
					if (err?.response?.data?.message) {
						errMsg = err.response.data.message;
					} else if (err?.response?.data?.err?.message) {
						errMsg = err.response.data.err.message;
					} else if (err?.message) {
						errMsg = err.message;
					}
					
					console.log('Mensaje de error específico:', errMsg);
					vscode.window.showErrorMessage(`Error en configuración: ${errMsg}`);
				}
			}
		}
	});
	context.subscriptions.push(config);

	const disposable = vscode.commands.registerCommand('code-reviewer.review', async () => {
		// Verificar si ya hay un análisis en progreso
		if (isAnalysisInProgress) {
			vscode.window.showWarningMessage('⏳ Ya hay un análisis en progreso. Por favor, espere a que termine antes de iniciar otro.');
			return;
		}

		const editor = vscode.window.activeTextEditor;
		if (!editor) {
			vscode.window.showInformationMessage('No se encontró el editor para el archivo guardado.');
			return;
		}
		const fileName = editor.document.fileName;
		
		// Verificar si el archivo es compatible usando la nueva detección de lenguaje
		try {
			const language = detectLanguageFromFile(fileName);
			console.log(`Archivo detectado como: ${language}`);
		} catch (langError) {
			const supportedExts = Object.keys(EXTENSION_TO_LANGUAGE).map(ext => `.${ext}`).join(', ');
			vscode.window.showInformationMessage(`Este tipo de archivo no es compatible. Extensiones soportadas: ${supportedExts}`);
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
			// Marcar que el análisis está en progreso
			isAnalysisInProgress = true;
			
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
					const analysisPromise = analyzeFile(fileName, { trigger: 'manual' }).then((result) => {
						analysisResult = result;
						console.log('Analysis result:', analysisResult);
						
						// Convertir issues a diagnósticos
						diagnostics = convertIssuesToDiagnostics(analysisResult.issues || []);
						diagnosticsInstance.setDiagnostics(diagnostics);
						
						analysisCompleted = true;
					});
					
					progress.report({ increment: 0, message: 'Iniciando análisis...' });
					
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
					}, 15000); // 15 segundos
					
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

					// Verificar si debe generar sugerencias detalladas automáticamente
					const autoGenerate = vscode.workspace.getConfiguration('codeReviewer').get('autoGenerateDetailedSuggestions', false);
					if (autoGenerate && analysisResult && (analysisResult.analysisId || analysisResult.id)) {
						const analysisId = analysisResult.analysisId || analysisResult.id;
						console.log('Auto-generating detailed suggestions for analysis:', analysisId);
						setTimeout(() => {
							handleGenerateDetailedSuggestions(context, analysisId);
						}, 1000); // Pequeño delay para no bloquear la UI
					}
				}
			);
		} catch (error) {
			console.error('Error during analysis:', error);
			
			// Detectar si el error fue debido a reautenticación automática
			if (error.message && error.message.includes('Error de autenticación')) {
				// Verificar si la reautenticación fue exitosa
				if (authentication.token) {
					vscode.window.showInformationMessage('Sesión renovada automáticamente. El análisis se completó exitosamente.');
				} else {
					vscode.window.showErrorMessage('Error de autenticación. Por favor, intente nuevamente.');
				}
			} else {
				// Extraer mensaje específico del servidor
				let errMsg = 'Error desconocido';
				if (error?.response?.data?.message) {
					errMsg = error.response.data.message;
				} else if (error?.response?.data?.err?.message) {
					errMsg = error.response.data.err.message;
				} else if (error?.message) {
					errMsg = error.message;
				}
				
				console.log('Mensaje de error específico durante análisis:', errMsg);
				vscode.window.showErrorMessage(`Error durante el análisis: ${errMsg}`);
			}
		} finally {
			// Siempre liberar el bloqueo al finalizar
			isAnalysisInProgress = false;
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

	// Comando para limpiar autenticación (útil para debugging y cuando hay problemas de token)
	const clearAuth = vscode.commands.registerCommand('code-reviewer.clearAuth', async () => {
		const { clearAuthentication, getAuthenticationStatus } = require('./service');
		const authStatus = getAuthenticationStatus();
		
		if (!authStatus.hasToken && !authStatus.hasRefreshToken) {
			vscode.window.showInformationMessage('No hay sesión activa para limpiar.');
			return;
		}

		const result = await vscode.window.showWarningMessage(
			'¿Está seguro de que desea limpiar la sesión actual? Esto requerirá autenticarse nuevamente.',
			'Sí, limpiar sesión',
			'Cancelar'
		);

		if (result === 'Sí, limpiar sesión') {
			clearAuthentication();
			vscode.window.showInformationMessage('Sesión limpiada. Se requerirá una nueva autenticación en el próximo análisis.');
		}
	});
	context.subscriptions.push(clearAuth);

	// Comando para generar sugerencias detalladas
	const generateDetailedSuggestionsCmd = vscode.commands.registerCommand('code-reviewer.generateDetailedSuggestions', async () => {
		// Verificar si ya hay sugerencias detalladas en progreso
		if (isDetailedSuggestionsInProgress) {
			vscode.window.showWarningMessage('⏳ Ya se está generando un informe detallado. Por favor, espere a que termine antes de solicitar otro.');
			return;
		}

		const analysisId = await vscode.window.showInputBox({
			prompt: 'Ingrese el ID del análisis para generar sugerencias detalladas',
			placeHolder: 'analysis_id_here'
		});
		
		if (analysisId) {
			await handleGenerateDetailedSuggestions(context, analysisId);
		}
	});
	context.subscriptions.push(generateDetailedSuggestionsCmd);

	const saveListener = vscode.workspace.onDidSaveTextDocument(async (document) => {
		const now = Date.now();
		const ext = document.fileName.split('.').pop();
		const fileName = path.basename(document.fileName);

		if (fileName === 'crconfig.yml') {
			await vscode.commands.executeCommand('code-reviewer.config', { reason: 'configUpdate' });
			return;
		}

		// Verificar si el archivo es soportado usando la nueva detección de lenguaje
		try {
			detectLanguageFromFile(document.fileName);
			// Si llegamos aquí, el archivo es soportado
		} catch (langError) {
			// Archivo no soportado, ignorar
			return;
		}

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
	});
	context.subscriptions.push(saveListener);
}

/**
 * Maneja la generación de sugerencias detalladas
 */
async function handleGenerateDetailedSuggestions(context, analysisId) {
	// Verificar si ya hay sugerencias detalladas en progreso
	if (isDetailedSuggestionsInProgress) {
		vscode.window.showWarningMessage('⏳ Ya se está generando un informe detallado. Por favor, espere a que termine antes de solicitar otro.');
		return;
	}

	if (!analysisId) {
		vscode.window.showErrorMessage('ID de análisis no disponible');
		return;
	}

	try {
		// Marcar que las sugerencias detalladas están en progreso
		isDetailedSuggestionsInProgress = true;
		// Mostrar progreso
		await vscode.window.withProgress({
			location: vscode.ProgressLocation.Notification,
			title: 'Generando informe detallado',
			cancellable: false
		}, async (progress) => {
			let currentProgress = 0;
			let analysisCompleted = false;
			
			// Inicializar progreso
			progress.report({ increment: 0, message: 'Iniciando generación de análisis detallado...' });
			
			// Crear el intervalo de progreso cada 10 segundos
			const progressInterval = setInterval(() => {
				if (!analysisCompleted && currentProgress < 85) {
					currentProgress += 15; // Incrementar 15% cada 10 segundos
					if (currentProgress > 85) currentProgress = 85;
					
					let message = 'Generando análisis detallado...';
					if (currentProgress < 20) {
						message = 'Preparando análisis...';
					} else if (currentProgress < 40) {
						message = 'Procesando código fuente...';
					} else if (currentProgress < 60) {
						message = 'Aplicando reglas de análisis...';
					} else if (currentProgress < 85) {
						message = 'Generando recomendaciones...';
					}
					
					progress.report({ increment: currentProgress, message });
				}
			}, 15000); // 15 segundos
			
			try {
				// Ejecutar la generación en paralelo
				const analysisPromise = generateDetailedSuggestions(analysisId).then((result) => {
					analysisCompleted = true;
					return result;
				});
				
				const suggestions = await analysisPromise;
				
				// Limpiar el intervalo y completar
				clearInterval(progressInterval);
				progress.report({ increment: 100, message: 'Análisis completado exitosamente' });
				
				// Pequeña pausa para mostrar el 100%
				await new Promise(resolve => setTimeout(resolve, 500));
				
				showDetailedSuggestionsPanel(suggestions);
			} catch (error) {
				clearInterval(progressInterval);
				
				if (error.message.includes('Error de autenticación')) {
					console.log('Error de autenticación, intentando reautenticar...');
					try {
						// Reiniciar progreso para reautenticación
						currentProgress = 0;
						analysisCompleted = false;
						progress.report({ increment: 0, message: 'Reautenticando y reintentando...' });
						
						const suggestions = await handleAuthError(generateDetailedSuggestions, analysisId);
						progress.report({ increment: 100, message: 'Análisis completado tras reautenticación' });
						showDetailedSuggestionsPanel(suggestions);
					} catch (authError) {
						throw authError;
					}
				} else {
					throw error;
				}
			}
		});
	} catch (error) {
		console.error('Error generating detailed suggestions:', error);
		vscode.window.showErrorMessage(`Error generando sugerencias detalladas: ${error.message}`);
	} finally {
		// Siempre liberar el bloqueo al finalizar
		isDetailedSuggestionsInProgress = false;
	}
}

/**
 * Muestra las sugerencias detalladas usando Showdown y un panel compartido
 */
async function showDetailedSuggestionsPanel(suggestions) {
	try {
		// Decodificar el contenido markdown
		let markdownContent = '';
		if (suggestions.fullSuggestionMarkdown) {
			if (suggestions.fullSuggestionMarkdown.startsWith('#')) {
				markdownContent = suggestions.fullSuggestionMarkdown;
			} else {
				try {
					markdownContent = Buffer.from(suggestions.fullSuggestionMarkdown, 'base64').toString('utf8');
				} catch (e) {
					markdownContent = suggestions.fullSuggestionMarkdown;
				}
			}
		}

		// Crear o reutilizar el panel compartido
		if (!sharedAnalysisPanel || sharedAnalysisPanel.panel.disposed) {
			sharedAnalysisPanel = createSharedAnalysisPanel();
		}

		// Actualizar el contenido del panel
		const htmlContent = generateMarkdownWebviewHTML(markdownContent, suggestions, 'detailed');
		sharedAnalysisPanel.panel.webview.html = htmlContent;
		
		// Cambiar el título para indicar que es un informe detallado
		sharedAnalysisPanel.panel.title = '📊 Informe Detallado - Code Reviewer';
		
		// Revelar el panel
		sharedAnalysisPanel.panel.reveal(vscode.ViewColumn.Beside);

	} catch (error) {
		console.error('Error mostrando sugerencias detalladas:', error);
		vscode.window.showErrorMessage(`Error mostrando el informe: ${error.message}`);
	}
}

/**
 * Crea el panel compartido para análisis
 */
function createSharedAnalysisPanel() {
	const panel = vscode.window.createWebviewPanel(
		'codeReviewerSharedAnalysis',
		'📊 Code Reviewer - Análisis',
		vscode.ViewColumn.Beside,
		{
			enableScripts: true,
			retainContextWhenHidden: true,
			localResourceRoots: []
		}
	);

	// Limpiar la referencia cuando se cierre el panel
	panel.onDidDispose(() => {
		sharedAnalysisPanel = null;
	});

	return { panel };
}

/**
 * Genera HTML optimizado para webview usando Showdown para renderizado de Markdown
 */
function generateMarkdownWebviewHTML(markdownContent, suggestions, type = 'summary') {
	// Configurar Showdown con opciones optimizadas
	const converter = new showdown.Converter({
		tables: true,
		strikethrough: true,
		tasklists: true,
		simpleLineBreaks: true,
		openLinksInNewWindow: true,
		backslashEscapesHTMLTags: true,
		ghCodeBlocks: true,
		ghMentions: false,
		extensions: []
	});

	// Convertir Markdown a HTML usando Showdown
	const htmlContent = converter.makeHtml(markdownContent);

	// Título y contenido según el tipo
	const isDetailed = type === 'detailed';
	const title = isDetailed ? '📊 Informe Detallado de Análisis' : '📊 Análisis de Código';
	
	return `
		<!DOCTYPE html>
		<html lang="es">
		<head>
			<meta charset="UTF-8">
			<meta name="viewport" content="width=device-width, initial-scale=1.0">
			<title>${title}</title>
			<style>
				body {
					font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Oxygen', 'Ubuntu', 'Cantarell', sans-serif;
					line-height: 1.6;
					margin: 0;
					padding: 20px;
					background-color: var(--vscode-editor-background);
					color: var(--vscode-editor-foreground);
					max-width: 1200px;
					margin: 0 auto;
				}
				
				.header {
					border-bottom: 2px solid var(--vscode-panel-border);
					padding: 20px;
					margin-bottom: 30px;
					background: var(--vscode-editor-inactiveSelectionBackground);
					border-radius: 8px;
				}
				
				.metadata {
					display: flex;
					gap: 15px;
					flex-wrap: wrap;
					margin: 15px 0;
					font-size: 0.9em;
				}
				
				.metadata-item {
					background: var(--vscode-badge-background);
					color: var(--vscode-badge-foreground);
					padding: 6px 12px;
					border-radius: 15px;
					font-weight: 500;
				}
				
				.cached { background: #28a745 !important; color: white !important; }
				.fresh { background: #007acc !important; color: white !important; }
				
				h1 {
					color: var(--vscode-textLink-foreground);
					margin-top: 0;
					font-size: 2em;
					border-bottom: none;
				}
				
				h2 {
					color: var(--vscode-textLink-foreground);
					border-bottom: 1px solid var(--vscode-panel-border);
					padding-bottom: 8px;
					margin-top: 30px;
				}
				
				h3 {
					color: var(--vscode-textLink-foreground);
					margin-top: 25px;
				}
				
				/* Mejorar el styling de código generado por Showdown */
				pre {
					background: var(--vscode-textCodeBlock-background) !important;
					border: 1px solid var(--vscode-panel-border) !important;
					border-radius: 6px;
					padding: 16px;
					overflow-x: auto;
					margin: 16px 0;
					font-family: 'Courier New', 'Monaco', 'Menlo', monospace;
					font-size: 0.9em;
				}
				
				code {
					background: var(--vscode-textCodeBlock-background) !important;
					border: 1px solid var(--vscode-panel-border);
					padding: 2px 6px;
					border-radius: 3px;
					font-family: 'Courier New', 'Monaco', 'Menlo', monospace;
					font-size: 0.9em;
				}
				
				/* Código dentro de pre no necesita border */
				pre code {
					background: transparent !important;
					border: none !important;
					padding: 0;
				}
				
				/* Tablas generadas por Showdown */
				table {
					border-collapse: collapse;
					width: 100%;
					margin: 16px 0;
				}
				
				th, td {
					border: 1px solid var(--vscode-panel-border);
					padding: 8px 12px;
					text-align: left;
				}
				
				th {
					background: var(--vscode-editor-inactiveSelectionBackground);
					font-weight: 600;
				}
				
				ul, ol {
					padding-left: 20px;
				}
				
				li {
					margin: 5px 0;
				}
				
				hr {
					border: none;
					border-top: 1px solid var(--vscode-panel-border);
					margin: 30px 0;
				}
				
				a {
					color: var(--vscode-textLink-foreground);
					text-decoration: none;
				}
				
				a:hover {
					text-decoration: underline;
				}
				
				p {
					margin: 12px 0;
				}
				
				strong {
					font-weight: 600;
				}
				
				blockquote {
					border-left: 4px solid var(--vscode-textLink-foreground);
					margin: 16px 0;
					padding: 0 16px;
					background: var(--vscode-editor-inactiveSelectionBackground);
					border-radius: 0 4px 4px 0;
				}
				
				.content {
					animation: fadeIn 0.3s ease-in;
				}
				
				@keyframes fadeIn {
					from { opacity: 0; transform: translateY(10px); }
					to { opacity: 1; transform: translateY(0); }
				}
				
				/* Scrollbar personalizado */
				::-webkit-scrollbar {
					width: 8px;
				}
				
				::-webkit-scrollbar-track {
					background: var(--vscode-scrollbarSlider-background);
				}
				
				::-webkit-scrollbar-thumb {
					background: var(--vscode-scrollbarSlider-activeBackground);
					border-radius: 4px;
				}
			</style>
		</head>
		<body>
			${isDetailed && suggestions ? `
			<div class="header">
				<h1>${title}</h1>
				<div class="metadata">
					<span class="metadata-item ${suggestions.cached ? 'cached' : 'fresh'}">
						${suggestions.cached ? '🟢 Desde Caché' : '🆕 Recién Generado'}
					</span>
					<span class="metadata-item">
						🕒 ${new Date(suggestions.generatedAt).toLocaleString()}
					</span>
					<span class="metadata-item">
						⚡ ${suggestions.timings.latency}ms
					</span>
					${suggestions.usageCost ? `
					<span class="metadata-item">
						💰 $${suggestions.usageCost.usdCost.toFixed(4)}
					</span>
					` : ''}
				</div>
			</div>
			` : ''}
			
			<div class="content">
				${htmlContent}
			</div>
		</body>
		</html>
	`;
}

function showAnalysisPanel(context, analysisResult) {
	// Crear o reutilizar el panel compartido
	if (!sharedAnalysisPanel || sharedAnalysisPanel.panel.disposed) {
		sharedAnalysisPanel = createSharedAnalysisPanel();
		
		// Manejar mensajes del webview solo una vez
		sharedAnalysisPanel.panel.webview.onDidReceiveMessage(
			async message => {
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
					case 'generateDetailedSuggestions':
						await handleGenerateDetailedSuggestions(context, message.analysisId);
						break;
				}
			},
			undefined,
			context.subscriptions
		);
	}

	// Generar el contenido HTML del panel
	const htmlContent = generateAnalysisHTML(analysisResult);
	sharedAnalysisPanel.panel.webview.html = htmlContent;
	
	// Cambiar el título para indicar que es un resumen
	sharedAnalysisPanel.panel.title = '📊 Resumen de Análisis - Code Reviewer';
	
	// Revelar el panel
	sharedAnalysisPanel.panel.reveal(vscode.ViewColumn.Beside);
}

function generateAnalysisHTML(analysisResult) {
	const evaluation = analysisResult.evaluation || {};
	const issues = analysisResult.issues || [];
	
	// Verificar si hay analysisId disponible para generar sugerencias detalladas
	const analysisId = analysisResult.analysisId || analysisResult.id;
	const showDetailedButton = vscode.workspace.getConfiguration('codeReviewer').get('showDetailedSuggestionsButton', true);

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
				.detailed-suggestion-section {
					background: var(--vscode-textCodeBlock-background);
					border: 1px solid var(--vscode-panel-border);
					border-radius: 8px;
					padding: 20px;
					margin: 20px 0;
				}
				.detailed-suggestion-card {
					text-align: center;
				}
				.button-group {
					display: flex;
					gap: 10px;
					justify-content: center;
					margin-top: 15px;
				}
				.primary-button, .secondary-button {
					padding: 10px 20px;
					border: none;
					border-radius: 5px;
					cursor: pointer;
					font-size: 14px;
					font-weight: 500;
				}
				.primary-button {
					background-color: var(--vscode-button-background);
					color: var(--vscode-button-foreground);
				}
				.primary-button:hover {
					background-color: var(--vscode-button-hoverBackground);
				}
				.secondary-button {
					background-color: var(--vscode-button-secondaryBackground);
					color: var(--vscode-button-secondaryForeground);
				}
				.secondary-button:hover {
					background-color: var(--vscode-button-secondaryHoverBackground);
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
				
				function generateDetailedSuggestions() {
					vscode.postMessage({
						command: 'generateDetailedSuggestions',
						analysisId: '${analysisId || ''}'
					});
				}
				
				function checkExistingSuggestions() {
					vscode.postMessage({
						command: 'checkExistingSuggestions',
						analysisId: '${analysisId || ''}'
					});
				}
			</script>
		</head>
		<body>
			<div class="header">
				<h1>📊 Análisis de Código</h1>
				${analysisResult.shortSuggestion ? `<p><strong>Sugerencia rápida:</strong> ${analysisResult.shortSuggestion}</p>` : ''}
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

			${issues.length > 0 ? `
			<div class="section">
				<h2>⚠️ Issues Encontrados</h2>
				${issues.map(issue => `
					<div class="issue ${issue.severity || 'suggestion'}">
						<div class="issue-header">
							<span class="issue-title">${issue.title || 'Issue'}</span>
							${issue.line ? `<span class="issue-location" onclick="openFile(${issue.line})">Línea ${issue.line}</span>` : ''}
						</div>
						<p>${issue.message || 'Sin descripción'}</p>
						${issue.codeBefore ? `
							<div class="code-block code-before">
								<strong>Antes:</strong><br>
								<code>${issue.codeBefore}</code>
							</div>
						` : ''}
						${issue.codeAfter ? `
							<div class="code-block code-after">
								<strong>Después:</strong><br>
								<code>${issue.codeAfter}</code>
							</div>
						` : ''}
					</div>
				`).join('')}
			</div>
			` : ''}

			${analysisId ? `
			<div class="section">
				<div class="detailed-suggestion-section">
					<div class="detailed-suggestion-card">
						<h3>📊 Informe Detallado</h3>
						<p>Genera un análisis completo con recomendaciones específicas y ejemplos de código.</p>
						<div class="button-group">
							<button class="primary-button" onclick="generateDetailedSuggestions()">
								Generar Informe
							</button>
						</div>
					</div>
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
