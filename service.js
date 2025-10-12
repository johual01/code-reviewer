const axios = require('axios');
const fs = require('fs');
const path = require('path');
const vscode = require('vscode');
const FormData = require('form-data');

// Configuración del servidor
const SERVER_URL = process.env.HOST || 'http://localhost:3000/api';

const authentication = {
    token: null,
    refreshToken: null,
    userId: null,
    projectId: null,
    rulesetVersion: null,
    rulesetStatus: null
}

async function obtainFile(filePath) {
    return new Promise((resolve, reject) => {
        fs.readFile(filePath, (err, fileData) => {
            if (err) {
                console.error('Error reading file:', err);
                reject(err);
                return;
            }
            resolve(fileData);
        });
    });
}

async function refreshToken() {
    if (!authentication.refreshToken) {
        throw new Error('No refresh token available.');
    }

    try {
        const response = await axios.post(SERVER_URL + '/auth/refresh', {
            refreshToken: authentication.refreshToken,
        }, {
            headers: {
                'Content-Type': 'application/json',
            },
        });

        if (response.data.success) {
            authentication.token = response.data.data.token;
            authentication.userId = response.data.data.userId;
            authentication.projectId = response.data.data.projectId;
            console.log('Token renovado exitosamente:', response.data.message);
            return response.data.data;
        } else {
            // Verificar si el mensaje indica que el token es muy viejo
            const errorMessage = response.data.message || '';
            if (errorMessage.includes('Token too old to refresh')) {
                throw new Error('TOKEN_TOO_OLD');
            }
            throw new Error('Error al renovar el token');
        }
    } catch (error) {
        // Si es un error de respuesta del servidor
        if (error.response && error.response.data && error.response.data.message) {
            const errorMessage = error.response.data.message;
            if (errorMessage.includes('Token too old to refresh') || errorMessage.includes('please login again')) {
                console.log('Token demasiado viejo, se requiere nueva autenticación');
                throw new Error('TOKEN_TOO_OLD');
            }
        }
        
        console.error('Error refreshing token:', error);
        throw error;
    }
}

// Nueva función para limpiar la autenticación y forzar re-login
function clearAuthentication() {
    authentication.token = null;
    authentication.refreshToken = null;
    authentication.userId = null;
    authentication.projectId = null;
    authentication.rulesetVersion = null;
    authentication.rulesetStatus = null;
    console.log('Autenticación limpiada, se requerirá nueva sesión');
}

// Nueva función para verificar el estado de la autenticación
function getAuthenticationStatus() {
    return {
        hasToken: !!authentication.token,
        hasRefreshToken: !!authentication.refreshToken,
        userId: authentication.userId,
        projectId: authentication.projectId
    };
}

// Nueva función para manejar errores de autenticación con reintento automático
async function handleAuthError(originalFunction, ...args) {
    try {
        await refreshToken();
        return await originalFunction(...args);
    } catch (refreshError) {
        if (refreshError.message === 'TOKEN_TOO_OLD') {
            console.log('Token demasiado viejo, iniciando nueva sesión automáticamente...');
            clearAuthentication();
            // Crear nueva sesión
            await createSession();
            // Reintentar la función original
            return await originalFunction(...args);
        }
        throw new Error('Token de autenticación inválido y no se pudo renovar. Por favor, cree una nueva sesión.');
    }
}

async function createSession() {
    const accounts = await vscode.authentication.getAccounts('github');
    if (!accounts || accounts.length === 0) {
        throw new Error('No GitHub account associated with VSCode.');
    }

    const userIdentity = accounts[0];
    console.log('Using GitHub account:', JSON.stringify(userIdentity));
    
    try {
        const response = await axios.post(SERVER_URL + '/auth/session', {
            githubId: userIdentity.id,
            githubUsername: userIdentity.label
        }, {
            headers: {
                'Content-Type': 'application/json',
            },
        });

        if (response.data.success) {
            authentication.token = response.data.data.token;
            authentication.refreshToken = response.data.data.refreshToken;
            authentication.userId = response.data.data.userId;
            authentication.projectId = response.data.data.projectId;
            authentication.rulesetVersion = response.data.data.rulesetVersion;
            authentication.rulesetStatus = response.data.data.rulesetStatus;
            console.log('Sesión creada exitosamente:', response.data.message);
            return response.data.data;
        } else {
            throw new Error('Error al crear la sesión');
        }
    } catch (error) {
        console.error('Error creating session:', error);
        throw error;
    }
}

async function updateConfiguration(rules, reason = 'update') {
    if (!authentication.token) {
        throw new Error('No authentication token available. Please create session first.');
    }

    const makeRequest = async () => {
        return await axios.post(SERVER_URL + '/rules/config-changed', {
            projectId: authentication.projectId,
            reason: reason,
            rules: rules
        }, {
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${authentication.token}`,
            },
        });
    };

    try {
        const response = await makeRequest();

        if (response.data.success) {
            // Actualizar versión del ruleset si está disponible
            if (response.data.data.rulesetVersion) {
                authentication.rulesetVersion = response.data.data.rulesetVersion;
            }
            console.log('Configuración actualizada exitosamente:', response.data.message);
            return response.data.data;
        } else {
            throw new Error('Error al actualizar configuración');
        }
    } catch (error) {
        if (error.response && error.response.status === 401) {
            console.log('Auth token expired, attempting to handle auth error...');
            try {
                const retryResponse = await handleAuthError(makeRequest);
                
                if (retryResponse.data.success) {
                    if (retryResponse.data.data.rulesetVersion) {
                        authentication.rulesetVersion = retryResponse.data.data.rulesetVersion;
                    }
                    console.log('Configuración actualizada exitosamente tras reautenticación:', retryResponse.data.message);
                    return retryResponse.data.data;
                } else {
                    throw new Error('Error al actualizar configuración tras reautenticación');
                }
            } catch (authError) {
                throw new Error(`Error de autenticación: ${authError.message}`);
            }
        }
        console.error('Error updating configuration:', error);
        throw error;
    }
}

async function analyzeFile(filePath) {
    if (!authentication.token) {
        throw new Error('No hay token de autenticación disponible. Por favor, reinicie la sesión.');
    }

    const fileData = await obtainFile(filePath);
    if (!fileData) {
        throw new Error('No se pudo obtener el archivo para analizar.');
    }

    const makeRequest = async () => {
        const form = new FormData();
        form.append('rulesetVersion', authentication.rulesetVersion);
        form.append('filePath', filePath);
        form.append('fileContent', fileData, path.basename(filePath));
        form.append('projectId', authentication.projectId);

        return await axios.post(SERVER_URL + '/analyze', form, {
            headers: {
                'Content-Type': 'multipart/form-data',
                'Authorization': `Bearer ${authentication.token}`,
            },
        });
    };

    try {
        const response = await makeRequest();

        if (response.data.success) {
            console.log('Archivo analizado exitosamente:', response.data.message);
            return response.data.data;
        } else {
            throw new Error('Error al analizar el archivo');
        }
    } catch (error) {
        if (error.response && error.response.status === 401) {
            console.log('Auth token expired, attempting to handle auth error...');
            try {
                const retryResponse = await handleAuthError(makeRequest);
                
                if (retryResponse.data.success) {
                    console.log('Archivo analizado exitosamente tras reautenticación:', retryResponse.data.message);
                    return retryResponse.data.data;
                } else {
                    throw new Error('Error al analizar el archivo tras reautenticación');
                }
            } catch (authError) {
                throw new Error(`Error de autenticación: ${authError.message}`);
            }
        }
        console.error('Error analyzing file:', error);
        throw error;
    }
}

// Función auxiliar para convertir issues de la API a diagnósticos de VS Code
function convertIssuesToDiagnostics(issues) {
    return issues.map(issue => ({
        startLine: Math.max(0, issue.line - 1), // VS Code usa índices basados en 0
        startCharacter: Math.max(0, issue.column - 1),
        endLine: issue.line - 1,
        endCharacter: undefined, // Se puede calcular basado en el código
        message: `${issue.title}: ${issue.message}`,
        severity: issue.severity,
        ruleCode: issue.ruleCode,
        codeBefore: issue.codeBefore,
        codeAfter: issue.codeAfter,
        action: issue.action
    }));
}

module.exports = {
    createSession,
    refreshToken,
    updateConfiguration,
    analyzeFile,
    convertIssuesToDiagnostics,
    clearAuthentication,
    handleAuthError,
    getAuthenticationStatus,
    authentication
};