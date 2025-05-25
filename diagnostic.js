const getDiagnostics = (lines) => {
    const diagnostics = [];
    lines.forEach((line, idx) => {
		if (line.includes('Generator is already executing.')) {
			diagnostics.push({
				line: idx,
				message: 'Está mal escrito'
			});
		}
	});
    return diagnostics;
};

module.exports = {
    getDiagnostics
}