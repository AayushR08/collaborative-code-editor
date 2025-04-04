document.getElementById("new-file-btn").addEventListener("click", () => {
    document.getElementById("file-modal").style.display = "block";
});

document.getElementById("modal-confirm-btn").addEventListener("click", () => {
    const name = document.getElementById("file-name-input").value;
    const lang = document.getElementById("file-language-select").value;

    if (name && !files[name]) {
        files[name] = { content: '', language: lang };
        addTab(name);
        switchFile(name);
    }

    document.getElementById("file-modal").style.display = "none";
});

function addTab(name) {
    const tab = document.createElement("div");
    tab.classList.add("file-tab");
    tab.textContent = name;
    tab.addEventListener("click", () => switchFile(name));
    document.getElementById("file-tabs").appendChild(tab);
}

function switchFile(name) {
    currentFile = name;
    const file = files[name];
    setEditorContent(file.content, file.language);
    updateActiveTab(name);
}

function updateActiveTab(name) {
    document.querySelectorAll(".file-tab").forEach(tab => {
        tab.classList.toggle("active", tab.textContent === name);
    });
}
