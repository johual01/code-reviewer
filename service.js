const axios = require('axios');
const fs = require('fs');
const path = require('path');
const vscode = require('vscode');

const autenthication = {
    authToken: null,
    refreshToken: null,
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
    if (!autenthication.refreshToken) {
        throw new Error('No refresh token available.');
    }

    try {
        const response = await axios.post(process.env.HOST + '/auth/refresh', {
            refreshToken: autenthication.refreshToken,
        });

        autenthication.authToken = response.data.authToken;
        autenthication.refreshToken = response.data.refreshToken;
        console.log('Tokens refreshed successfully.');
    } catch (error) {
        console.error('Error refreshing token:', error);
        throw error;
    }

}

async function createContext(configPath) {
    const accounts = await vscode.authentication.getAccounts('github');
    if (!accounts || accounts.length === 0) {
        throw new Error('No GitHub account associated with VSCode.');
    }

    const userIdentity = accounts[0];
    const fileData = await obtainFile(configPath);
    if (!fileData) {
        throw new Error('No se pudo obtener el archivo de configuración para enviar.');
    }

    const form = new FormData();
    form.append('identity', JSON.stringify(userIdentity));
    form.append('config', fileData, path.basename(configPath));

    const response = await axios.post(process.env.HOST + '/context', form, {
        headers: {
            'Content-Type': 'multipart/form-data',
        },
    });

    autenthication.authToken = response.data.authToken;
    autenthication.refreshToken = response.data.refreshToken;
    console.log('Contexto creado exitosamente:', response.data);
    return response.data;
}

async function updateConfiguration(configPath) {
    const fileData = await obtainFile(configPath);
    if (!fileData) {
        throw new Error('No se pudo obtener el archivo de configuración para enviar.');
    }

    const form = new FormData();
    form.append('config', fileData, path.basename(configPath));

    try {
        const response = await axios.post(process.env.HOST + '/config', form, {
            headers: {
                'Content-Type': 'multipart/form-data',
                'Authorization': `Bearer ${autenthication.authToken}`,
            },
        });

        console.log('Configuración actualizada exitosamente:', response.data);
        return response.data;
    } catch (error) {
        if (error.response && error.response.status === 401) {
            console.log('Auth token expired, refreshing...');
            await refreshToken();
            const retryResponse = await axios.post(process.env.HOST + '/config', form, {
                headers: {
                    'Content-Type': 'multipart/form-data',
                    'Authorization': `Bearer ${autenthication.authToken}`,
                },
            });
            console.log('Configuración actualizada exitosamente tras reintento:', retryResponse.data);
            return retryResponse.data;
        }
        throw error;
    }
}

async function sendFile(filePath) {
    const fileData = await obtainFile(filePath);
    const filename = path.basename(filePath);
    if (!fileData) {
        throw new Error('No se pudo obtener el archivo para enviar.');
    }

    const form = new FormData();
    form.append('file', fileData, filename);

    try {
        const response = await axios.post(process.env.HOST + '/review', form, {
            headers: {
                'Content-Type': 'multipart/form-data',
                'Authorization': `Bearer ${autenthication.authToken}`,
            },
        });

        console.log('Archivo enviado exitosamente:', response.data);
        return response.data;
    } catch (error) {
        if (error.response && error.response.status === 401) {
            console.log('Auth token expired, refreshing...');
            await refreshToken();
            const retryResponse = await axios.post(process.env.HOST + '/review', form, {
                headers: {
                    'Content-Type': 'multipart/form-data',
                    'Authorization': `Bearer ${autenthication.authToken}`,
                },
            });
            console.log('Archivo enviado exitosamente tras reintento:', retryResponse.data);
            return retryResponse.data;
        }
        throw error;
    }
}

module.exports = {
    createContext,
    updateConfiguration,
    sendFile
};