const axios = require('axios');
const fs = require('fs');
const path = require('path');
const vscode = require('vscode');
const FormData = require('form-data');

// Configuración del servidor
const SERVER_URL = process.env.HOST || 'http://localhost:3001/api/v1';

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
            throw new Error('Error al renovar el token');
        }
    } catch (error) {
        console.error('Error refreshing token:', error);
        throw error;
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

    try {
        const response = await axios.post(SERVER_URL + '/rules/config-changed', {
            projectId: authentication.projectId,
            reason: reason,
            rules: rules
        }, {
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${authentication.token}`,
            },
        });

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
            console.log('Auth token expired, refreshing...');
            try {
                await refreshToken();
                // Reintentar la petición con el nuevo token
                const retryResponse = await axios.post(SERVER_URL + '/rules/config-changed', {
                    projectId: authentication.projectId,
                    reason: reason,
                    rules: rules
                }, {
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${authentication.token}`,
                    },
                });
                
                if (retryResponse.data.success) {
                    if (retryResponse.data.data.rulesetVersion) {
                        authentication.rulesetVersion = retryResponse.data.data.rulesetVersion;
                    }
                    console.log('Configuración actualizada exitosamente tras reintento:', retryResponse.data.message);
                    return retryResponse.data.data;
                } else {
                    throw new Error('Error al actualizar configuración tras reintento');
                }
            } catch (refreshError) {
                throw new Error('Token de autenticación inválido y no se pudo renovar. Por favor, cree una nueva sesión.');
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

    const form = new FormData();
    form.append('rulesetVersion', authentication.rulesetVersion);
    form.append('filePath', filePath);
    form.append('fileContent', fileData, path.basename(filePath));
    form.append('projectId', authentication.projectId);

    try {
        const response = await axios.post(SERVER_URL + '/analyze', form, {
            headers: {
                'Content-Type': 'multipart/form-data',
                'Authorization': `Bearer ${authentication.token}`,
            },
        });

        if (response.data.success) {
            console.log('Archivo analizado exitosamente:', response.data.message);
            return response.data.data;
        } else {
            throw new Error('Error al analizar el archivo');
        }
    } catch (error) {
        if (error.response && error.response.status === 401) {
            console.log('Auth token expired, refreshing...');
            try {
                await refreshToken();
                // Recrear el form con el nuevo token
                const retryForm = new FormData();
                retryForm.append('rulesetVersion', authentication.rulesetVersion);
                retryForm.append('filePath', filePath);
                retryForm.append('fileContent', fileData, path.basename(filePath));
                retryForm.append('projectId', authentication.projectId);
                
                const retryResponse = await axios.post(SERVER_URL + '/analyze', retryForm, {
                    headers: {
                        'Content-Type': 'multipart/form-data',
                        'Authorization': `Bearer ${authentication.token}`,
                    },
                });
                
                if (retryResponse.data.success) {
                    console.log('Archivo analizado exitosamente tras reintento:', retryResponse.data.message);
                    return retryResponse.data.data;
                } else {
                    throw new Error('Error al analizar el archivo tras reintento');
                }
            } catch (refreshError) {
                throw new Error('Token de autenticación inválido y no se pudo renovar. Por favor, cree una nueva sesión.');
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
    authentication
};