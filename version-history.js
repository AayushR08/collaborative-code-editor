document.getElementById("save-version-btn").addEventListener("click", () => {
    if (currentFile) {
        const timestamp = new Date().toLocaleTimeString();
        const version = {
            name: `${currentFile} - ${timestamp}`,
            content: files[currentFile].content
        };
        addVersion(version);
    }
});

function addVersion(version) {
    const list = document.getElementById("version-list");
    const item = document.createElement("div");
    item.classList.add("version-item");
    item.textContent = version.name;
    item.addEventListener("click", () => {
        if (currentFile) {
            files[currentFile].content = version.content;
            setEditorContent(version.content);
        }
    });
    list.appendChild(item);
}
