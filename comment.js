const vscode = require('vscode');

const createComments = (editor, diagnostics) => {
    const diagnosticCollection = vscode.languages.createDiagnosticCollection('codeReviewer');
    const vscodeDiagnostics = diagnostics.map(diagnostic => {
        const range = new vscode.Range(diagnostic.line, 0, diagnostic.line, Number.MAX_SAFE_INTEGER);
        return new vscode.Diagnostic(
            range,
            diagnostic.message,
            vscode.DiagnosticSeverity.Warning
        );
    });
    diagnosticCollection.set(editor.document.uri, vscodeDiagnostics);

    const decorationType = vscode.window.createTextEditorDecorationType({
        backgroundColor: 'rgba(255,255,0,0.2)',
        isWholeLine: true,
        gutterIconPath: vscode.Uri.file(__dirname + '/warning.svg'),
        gutterIconSize: 'contain'
    });

    const decorationRanges = diagnostics.map(diagnostic => {
        return {
            range: new vscode.Range(diagnostic.line, 0, diagnostic.line, Number.MAX_SAFE_INTEGER),
            hoverMessage: diagnostic.message
        };
    });

    editor.setDecorations(decorationType, decorationRanges);
};

module.exports = {
    createComments
};
