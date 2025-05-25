const vscode = require('vscode');

const createComments = (editor, diagnostics, commentsChannel) => {
    const diagnosticCollection = vscode.languages.createDiagnosticCollection('codeReviewer');
    const vscodeDiagnostics = diagnostics.map(diagnostic => {
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

    commentsChannel.clear();
    diagnostics.forEach(diagnostic => {
        const filePath = editor.document.uri.fsPath.replace(/\\/g, '/');
        const rangeInfo = `Líneas ${diagnostic.startLine + 1}-${(diagnostic.endLine || diagnostic.startLine) + 1}`;
        commentsChannel.appendLine(`${filePath}:${diagnostic.startLine + 1}:1: ${diagnostic.message} (${rangeInfo})`);
    });
    commentsChannel.show(true);

    const decorationType = vscode.window.createTextEditorDecorationType({
        backgroundColor: 'rgba(255, 200, 0, 0.3)',
        border: '1px solid rgba(255, 165, 0, 0.8)',
        isWholeLine: true,
        gutterIconPath: vscode.Uri.file(require('path').join(__dirname, '/resources/warning-icon.svg')),
        gutterIconSize: 'contain'
    });

    const decorationRanges = diagnostics.map(diagnostic => {
        const range = new vscode.Range(
            diagnostic.startLine,
            diagnostic.startCharacter || 0,
            diagnostic.endLine || diagnostic.startLine,
            diagnostic.endCharacter || Number.MAX_SAFE_INTEGER
        );

        const hoverMessage = diagnostic.endLine
            ? new vscode.MarkdownString(`${diagnostic.message}\n\n**Sugerencia:** Revisa estas líneas cuidadosamente.`)
            : new vscode.MarkdownString(`${diagnostic.message}\n\n**Sugerencia:** Revisa esta línea cuidadosamente.`);

        return {
            range,
            hoverMessage
        };
    });

    editor.setDecorations(decorationType, decorationRanges);
};

module.exports = {
    createComments
};
