const getDiagnostics = (lines) => {
    const diagnostics = [];
    lines.forEach((line, idx) => {
        if (line.includes('Generator is already executing.')) {
            const isSingleLine = true; // Adjust logic if needed for multi-line cases
            diagnostics.push({
                startLine: idx,
                startCharacter: 0,
                endLine: isSingleLine ? undefined : idx, // Undefined for single-line cases
                endCharacter: isSingleLine ? undefined : line.length, // Undefined for single-line cases
                message: 'Está mal escrito.'
            });
        }
    });
    return diagnostics;
};

module.exports = {
    getDiagnostics
}