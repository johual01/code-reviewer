const crypto = require('crypto');

class Diagnostics {
    constructor() {
        this.currentDiagnostics = [];
    }

    getCurrentDiagnostics() {
        return this.currentDiagnostics.filter(diagnostic => !diagnostic.isResolved);
    }

    generateDiagnostics(lines) {
        const diagnostics = [];
        lines.forEach((line, idx) => {
            if (line.includes('Generator is already executing.')) {
                diagnostics.push({
                    id: crypto.randomUUID(),
                    startLine: idx,
                    startCharacter: 0,
                    endLine: undefined,
                    endCharacter: undefined,
                    message: 'Está mal escrito.',
                    isResolved: false
                });
            }
        });
        this.currentDiagnostics = diagnostics;
        return diagnostics;
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