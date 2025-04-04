document.getElementById("run-code-btn").addEventListener("click", async () => {
    const output = document.getElementById("execution-result");
    output.classList.add("show");

    const resultEl = document.getElementById("result-output");
    resultEl.textContent = "Running...";

    try {
        const response = await fetch('/run', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                language: files[currentFile].language,
                code: editor.getValue()
            })
        });

        const data = await response.json();
        resultEl.textContent = data.output || data.error || 'No output';
    } catch (err) {
        resultEl.textContent = "Execution failed.";
    }
});

document.getElementById("clear-result-btn").addEventListener("click", () => {
    document.getElementById("execution-result").classList.remove("show");
});
