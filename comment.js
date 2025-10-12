const vscode = require('vscode');

let decorationType;

const createComments = (editor, diagnostics, diagnosticCollection) => {
    diagnosticCollection.clear();
    const unresolvedDiagnostics = diagnostics.filter(diagnostic => !diagnostic.isResolved);

    const vscodeDiagnostics = unresolvedDiagnostics.map(diagnostic => {
        const range = new vscode.Range(
            diagnostic.startLine,
            diagnostic.startCharacter || 0,
            diagnostic.endLine || diagnostic.startLine,
            diagnostic.endCharacter || Number.MAX_SAFE_INTEGER
        );
        const detailedMessage = diagnostic.endLine
            ? `${diagnostic.message} (Líneas: ${diagnostic.startLine + 1}-${diagnostic.endLine + 1})`
            : `${diagnostic.message} (Línea: ${diagnostic.startLine + 1})`;
        return new vscode.Diagnostic(
            range,
            detailedMessage,
            vscode.DiagnosticSeverity.Warning
        );
    });
    diagnosticCollection.set(editor.document.uri, vscodeDiagnostics);

    if (decorationType) {
        editor.setDecorations(decorationType, []);
    }

    decorationType = vscode.window.createTextEditorDecorationType({
        backgroundColor: 'rgba(255, 200, 0, 0.3)',
        border: '1px solid rgba(255, 165, 0, 0.8)',
        isWholeLine: true,
        gutterIconPath: vscode.Uri.file(require('path').join(__dirname, '/resources/warning-icon.svg')),
        gutterIconSize: 'contain',
    });

    const decorationRanges = unresolvedDiagnostics.map(diagnostic => {
        const range = new vscode.Range(
            diagnostic.startLine,
            diagnostic.startCharacter || 0,
            diagnostic.endLine || diagnostic.startLine,
            diagnostic.endCharacter || Number.MAX_SAFE_INTEGER
        );

        return {
            range
        };
    });

    editor.setDecorations(decorationType, decorationRanges);
};

module.exports = {
    createComments
};
