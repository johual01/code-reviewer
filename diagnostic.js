const crypto = require('crypto');
const { sendFile } = require('./service')

class Diagnostics {
    constructor() {
        this.currentDiagnostics = [];
    }

    getCurrentDiagnostics() {
        return this.currentDiagnostics.filter(diagnostic => !diagnostic.isResolved);
    }

    async generateDiagnostics(file) {
        const diagnostics = await sendFile(file);
        this.currentDiagnostics = diagnostics.map(diagnostic => {
            return {
                ...diagnostic,
                id: crypto.randomUUID(),
                isResolved: false
            };
        });
        return this.currentDiagnostics;
    }

    resolveDiagnostic(id) {
        const target = this.currentDiagnostics.find(diagnostic => diagnostic.id === id);
        if (target) {
            target.isResolved = true;
        }
    }

    findById(id) {
        return this.currentDiagnostics.find(diagnostic => diagnostic.id === id);
    }
}

module.exports = Diagnostics;