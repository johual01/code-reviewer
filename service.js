/* El sendFile espera un archivo y devuelve un objeto con la información del archivo enviado. 
[] {
    startLine: number,
    startCharacter: number,
    endLine: number | undefined,
    endCharacter: number | undefined,
    message: string,
}
*/

const axios = require('axios');
const fs = require('fs');
const path = require('path');

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
    // 1. Obtener la identidad del usuario desde el account de GitHub asociado al VSCode
    // 2. Obtener el archivo de configuración desde la ruta proporcionada
    // 3. Enviar la identidad obtenida y el archivo de configuración al servidor para crear el contexto, recibirá la autenticación y guardará los tokens
}

async function updateConfiguration(configPath) {
    if (!autenthication.authToken) {
        throw new Error('No authentication token available.');
    }

    const fileData = await obtainFile(configPath);
    if (!fileData) {
        throw new Error('No se pudo obtener el archivo de configuración para enviar.');
    }

    const form = new FormData();
    form.append('config', fileData, path.basename(configPath));

    const response = await axios.post(process.env.HOST + '/config', form, {
        headers: {
            'Content-Type': 'multipart/form-data',
            'Authorization': `Bearer ${autenthication.authToken}`,
        },
    });

    console.log('Configuración actualizada exitosamente:', response.data);
    return response.data;
}

// Send file to review to server
async function sendFile(filePath) {
    const fileData = await obtainFile(filePath);
    const filename = path.basename(filePath);
    if (!fileData) {
        throw new Error('No se pudo obtener el archivo para enviar.');
    }
    const form = new FormData();
    form.append('file', fileData, filename);
    const response = await axios.post(process.env.HOST + '/review', form, {
        headers: {
            'Content-Type': 'multipart/form-data',
            'Authorization': `Bearer ${autenthication.authToken}`,
        },
    });

    console.log('Archivo enviado exitosamente:', response.data);
    return response.data;
}

module.exports = {
    createContext,
    updateConfiguration,
    sendFile
};