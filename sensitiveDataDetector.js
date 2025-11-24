const vscode = require('vscode');
const showdown = require('showdown');

// Patrones para detectar datos sensibles
const SENSITIVE_DATA_PATTERNS = {
	// Claves API y tokens
	apiKeys: [
		/(?:api[_-]?key|apikey)\s*[=:]\s*['"`]([a-zA-Z0-9_\-]{16,})/gi,
		/(?:access[_-]?token|accesstoken)\s*[=:]\s*['"`]([a-zA-Z0-9_\-]{16,})/gi,
		/(?:secret[_-]?key|secretkey)\s*[=:]\s*['"`]([a-zA-Z0-9_\-]{16,})/gi,
		/(?:private[_-]?key|privatekey)\s*[=:]\s*['"`]([a-zA-Z0-9_\-]{16,})/gi,
		/(?:bearer|authorization)\s*[=:]\s*['"`]([a-zA-Z0-9_\-]{16,})/gi
	],
	// Claves AWS
	awsKeys: [
		/AKIA[0-9A-Z]{16}/g,
		/(?:aws[_-]?secret[_-]?access[_-]?key)\s*[=:]\s*['"`]([a-zA-Z0-9/+=]{40})/gi
	],
	// Contraseñas
	passwords: [
		/(?:password|pwd|pass)\s*[=:]\s*['"`]([^'"`\s]{6,})/gi,
		/(?:db[_-]?password|database[_-]?password)\s*[=:]\s*['"`]([^'"`\s]{6,})/gi
	],
	// Cadenas de conexión a base de datos
	connectionStrings: [
		/(?:connection[_-]?string|connectionstring)\s*[=:]\s*['"`]([^'"`]*)/gi,
		/(?:server|host)\s*=\s*[^;]+;\s*(?:database|initial catalog)\s*=[^;]+/gi,
		/mongodb:\/\/[^'"`\s]+/gi,
		/mysql:\/\/[^'"`\s]+/gi,
		/postgres(?:ql)?:\/\/[^'"`\s]+/gi
	],
	// Emails y información personal
	personalInfo: [
		/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g,
		/(?:ssn|social[_-]?security)\s*[=:]\s*['"`]?\d{3}[-\s]?\d{2}[-\s]?\d{4}/gi,
		/(?:credit[_-]?card|creditcard)\s*[=:]\s*['"`]?\d{4}[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{4}/gi
	],
	// URLs con credenciales
	urlsWithCredentials: [
		/https?:\/\/[^\/\s:]+:[^\/\s@]+@[^\s'"]+/g
	],
	// Tokens JWT
	jwtTokens: [
		/eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g
	],
	// Claves privadas
	privateKeys: [
		/-----BEGIN\s+(?:RSA\s+)?PRIVATE\s+KEY-----/gi,
		/-----BEGIN\s+OPENSSH\s+PRIVATE\s+KEY-----/gi
	]
};

/**
 * Detecta datos sensibles en el contenido del archivo
 * @param {string} content - Contenido del archivo a analizar
 * @returns {Array} Array de objetos con información sobre los datos sensibles encontrados
 */
function detectSensitiveData(content) {
	const findings = [];
	const lines = content.split('\n');
	
	for (const [category, patterns] of Object.entries(SENSITIVE_DATA_PATTERNS)) {
		for (const pattern of patterns) {
			let match;
			// Resetear el índice del regex para evitar problemas con búsquedas múltiples
			pattern.lastIndex = 0;
			
			while ((match = pattern.exec(content)) !== null) {
				// Encontrar el número de línea
				const beforeMatch = content.substring(0, match.index);
				const lineNumber = beforeMatch.split('\n').length;
				const columnNumber = beforeMatch.split('\n').pop().length + 1;
				
				findings.push({
					category,
					pattern: pattern.source,
					match: match[0],
					line: lineNumber,
					column: columnNumber,
					severity: getSensitivityLevel(category)
				});
				
				// Evitar bucles infinitos con patrones que no avanzan
				if (pattern.global && pattern.lastIndex === match.index) {
					pattern.lastIndex++;
				}
			}
		}
	}
	
	return findings;
}

/**
 * Determina el nivel de sensibilidad de los datos encontrados
 * @param {string} category - Categoría de datos sensibles
 * @returns {string} Nivel de severidad: 'high', 'medium', 'low'
 */
function getSensitivityLevel(category) {
	const highRisk = ['apiKeys', 'awsKeys', 'passwords', 'privateKeys', 'jwtTokens'];
	const mediumRisk = ['connectionStrings', 'urlsWithCredentials'];
	
	if (highRisk.includes(category)) return 'high';
	if (mediumRisk.includes(category)) return 'medium';
	return 'low';
}

/**
 * Muestra un diálogo de confirmación con detalles de los datos sensibles encontrados
 * @param {Array} sensitiveFindings - Array de hallazgos de datos sensibles
 * @returns {Promise<boolean>} true si el usuario confirma continuar, false si cancela
 */
async function showSensitiveDataWarning(sensitiveFindings) {
	const highRiskFindings = sensitiveFindings.filter(f => f.severity === 'high');
	const mediumRiskFindings = sensitiveFindings.filter(f => f.severity === 'medium');
	const lowRiskFindings = sensitiveFindings.filter(f => f.severity === 'low');
	
	let warningMessage = '🔒 **DATOS SENSIBLES DETECTADOS**\n\n';
	
	if (highRiskFindings.length > 0) {
		warningMessage += `🚨 **RIESGO ALTO** (${highRiskFindings.length} encontrados):\n`;
		highRiskFindings.slice(0, 3).forEach(finding => {
			const categoryName = getCategoryDisplayName(finding.category);
			warningMessage += `• Línea ${finding.line}: ${categoryName}\n`;
		});
		if (highRiskFindings.length > 3) {
			warningMessage += `• ... y ${highRiskFindings.length - 3} más\n`;
		}
		warningMessage += '\n';
	}
	
	if (mediumRiskFindings.length > 0) {
		warningMessage += `⚠️ **RIESGO MEDIO** (${mediumRiskFindings.length} encontrados):\n`;
		mediumRiskFindings.slice(0, 2).forEach(finding => {
			const categoryName = getCategoryDisplayName(finding.category);
			warningMessage += `• Línea ${finding.line}: ${categoryName}\n`;
		});
		if (mediumRiskFindings.length > 2) {
			warningMessage += `• ... y ${mediumRiskFindings.length - 2} más\n`;
		}
		warningMessage += '\n';
	}
	
	if (lowRiskFindings.length > 0) {
		warningMessage += `ℹ️ **RIESGO BAJO** (${lowRiskFindings.length} encontrados)\n\n`;
	}
	
	warningMessage += '¿Desea continuar con el análisis? Los datos sensibles podrían ser enviados al servicio de revisión.';
	
	const result = await vscode.window.showWarningMessage(
		warningMessage,
		{ modal: true },
		'Continuar Análisis',
		'Ver Detalles',
		'Cancelar'
	);
	
	if (result === 'Ver Detalles') {
		await showDetailedSensitiveDataReport(sensitiveFindings);
		// Después de mostrar detalles, preguntar de nuevo
		return await showSensitiveDataWarning(sensitiveFindings);
	}
	
	return result === 'Continuar Análisis';
}

/**
 * Muestra un reporte detallado de los datos sensibles encontrados
 * @param {Array} sensitiveFindings - Array de hallazgos de datos sensibles
 */
async function showDetailedSensitiveDataReport(sensitiveFindings) {
	let reportContent = '# Reporte Detallado de Datos Sensibles\n\n';
	
	const categorizedFindings = {};
	sensitiveFindings.forEach(finding => {
		if (!categorizedFindings[finding.category]) {
			categorizedFindings[finding.category] = [];
		}
		categorizedFindings[finding.category].push(finding);
	});
	
	for (const [category, findings] of Object.entries(categorizedFindings)) {
		const categoryName = getCategoryDisplayName(category);
		const severityIcon = findings[0].severity === 'high' ? '🚨' : 
		                    findings[0].severity === 'medium' ? '⚠️' : 'ℹ️';
		
		reportContent += `## ${severityIcon} ${categoryName} (${findings.length} encontrados)\n\n`;
		
		findings.forEach((finding, index) => {
			const maskedMatch = maskSensitiveValue(finding.match);
			reportContent += `**${index + 1}.** Línea ${finding.line}, Columna ${finding.column}\n`;
			reportContent += `   \`${maskedMatch}\`\n\n`;
		});
	}
	
	reportContent += '\n---\n\n';
	reportContent += '**Recomendaciones:**\n';
	reportContent += '• Mueva datos sensibles a variables de entorno\n';
	reportContent += '• Use archivos de configuración no versionados\n';
	reportContent += '• Considere usar servicios de gestión de secretos\n';
	reportContent += '• Agregue patrones sensibles a .gitignore\n';
	
	// Crear y mostrar panel con el reporte
	const panel = vscode.window.createWebviewPanel(
		'sensitiveDataReport',
		'Datos Sensibles Detectados',
		vscode.ViewColumn.Two,
		{ enableScripts: false }
	);
	
	const converter = new showdown.Converter();
	const htmlContent = converter.makeHtml(reportContent);
	
	panel.webview.html = `
		<!DOCTYPE html>
		<html>
		<head>
			<style>
				body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; padding: 20px; line-height: 1.6; }
				h1, h2 { color: #d73a49; }
				code { background: #f6f8fa; padding: 2px 4px; border-radius: 3px; font-family: 'Consolas', monospace; }
				pre { background: #f6f8fa; padding: 10px; border-radius: 5px; overflow-x: auto; }
				.warning { background: #fff3cd; border: 1px solid #ffeaa7; padding: 10px; border-radius: 5px; margin: 10px 0; }
			</style>
		</head>
		<body>
			${htmlContent}
		</body>
		</html>
	`;
}

/**
 * Obtiene el nombre de visualización para una categoría de datos sensibles
 * @param {string} category - Categoría interna
 * @returns {string} Nombre legible para mostrar al usuario
 */
function getCategoryDisplayName(category) {
	const displayNames = {
		apiKeys: 'Claves de API',
		awsKeys: 'Claves de AWS',
		passwords: 'Contraseñas',
		connectionStrings: 'Cadenas de Conexión',
		personalInfo: 'Información Personal',
		urlsWithCredentials: 'URLs con Credenciales',
		jwtTokens: 'Tokens JWT',
		privateKeys: 'Claves Privadas'
	};
	
	return displayNames[category] || category;
}

/**
 * Enmascara valores sensibles para mostrarlos de forma segura
 * @param {string} value - Valor a enmascarar
 * @returns {string} Valor enmascarado
 */
function maskSensitiveValue(value) {
	if (value.length <= 8) {
		return '*'.repeat(value.length);
	}
	
	const start = value.substring(0, 3);
	const end = value.substring(value.length - 3);
	const middle = '*'.repeat(Math.min(value.length - 6, 20));
	
	return `${start}${middle}${end}`;
}

module.exports = {
	detectSensitiveData,
	showSensitiveDataWarning,
	showDetailedSensitiveDataReport,
	getSensitivityLevel,
	getCategoryDisplayName,
	maskSensitiveValue,
	SENSITIVE_DATA_PATTERNS
};
