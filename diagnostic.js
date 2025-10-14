const crypto = require('crypto');
const { analyzeFile } = require('./service')

class Diagnostics {
    constructor() {
        this.currentDiagnostics = [];
    }

    getCurrentDiagnostics() {
        return this.currentDiagnostics.filter(diagnostic => !diagnostic.isResolved);
    }

    async generateDiagnostics(file) {
        try {
            const analysisResult = await analyzeFile(file, { trigger: 'auto' });
            const diagnostics = analysisResult.issues || [];
            
            this.currentDiagnostics = diagnostics.map(issue => {
                return {
                    startLine: Math.max(0, issue.line - 1),
                    endLine: issue.line - 1,
                    message: `${issue.title}: ${issue.message}`,
                    severity: issue.severity,
                    ruleCode: issue.ruleCode,
                    codeBefore: issue.codeBefore,
                    codeAfter: issue.codeAfter,
                    action: issue.action,
                    id: crypto.randomUUID(),
                };
            });
            
            return this.currentDiagnostics;
        } catch (error) {
            console.error('Error generating diagnostics:', error);
            throw error;
        }
    }

    setDiagnostics(diagnostics) {
        this.currentDiagnostics = diagnostics.map(diagnostic => {
            return {
                ...diagnostic,
                id: crypto.randomUUID(),
                isResolved: false
            };
        });
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