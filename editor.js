let editor;
let currentFile = null;
let files = {};

function initEditor() {
    editor = CodeMirror(document.getElementById("editor"), {
        value: '',
        mode: 'javascript',
        theme: 'monokai',
        lineNumbers: true,
        matchBrackets: true,
        autoCloseBrackets: true,
        tabSize: 2,
        indentUnit: 2,
        extraKeys: { "Ctrl-Space": "autocomplete" }
    });

    editor.on('change', () => {
        if (currentFile && !readOnly) {
            files[currentFile].content = editor.getValue();
            socket.emit('code-change', {
                roomId,
                content: editor.getValue(),
                file: currentFile
            });
        }
    });

    document.getElementById("theme-select").addEventListener("change", (e) => {
        editor.setOption("theme", e.target.value);
    });

    document.getElementById("font-size").addEventListener("input", (e) => {
        const size = `${e.target.value}px`;
        document.getElementById("font-size-value").textContent = size;
        editor.getWrapperElement().style.fontSize = size;
    });
}

function setEditorContent(content, lang = 'javascript') {
    editor.setValue(content);
    editor.setOption("mode", lang);
}
