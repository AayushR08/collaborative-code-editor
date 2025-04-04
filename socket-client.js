const socket = io();
let roomId = '';
let username = '';
let readOnly = false;

document.getElementById("join-btn").addEventListener("click", () => {
    username = document.getElementById("username-input").value;
    roomId = document.getElementById("room-id-input").value;
    readOnly = document.getElementById("read-only-mode").checked;

    if (username && roomId) {
        socket.emit("join-room", { roomId, username, readOnly });
        document.getElementById("room-id-display").textContent = roomId;
    }
});

document.getElementById("create-btn").addEventListener("click", () => {
    roomId = Math.random().toString(36).substring(2, 10);
    username = document.getElementById("username-input").value;
    socket.emit("join-room", { roomId, username });
    document.getElementById("room-id-display").textContent = roomId;
});

socket.on("code-update", ({ content, file }) => {
    if (file === currentFile && !readOnly) {
        editor.setValue(content);
    }
});

socket.on("user-list", (users) => {
    const ul = document.getElementById("users-list");
    ul.innerHTML = "";
    users.forEach(user => {
        const li = document.createElement("li");
        li.innerHTML = `<span>${user.username}</span>` +
                       (user.readOnly ? `<span class="read-only-badge">Read-Only</span>` : '');
        ul.appendChild(li);
    });
});
