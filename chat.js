document.getElementById("send-message-btn").addEventListener("click", () => {
    const msg = document.getElementById("message-input").value;
    if (msg.trim()) {
        socket.emit("chat-message", { roomId, username, message: msg });
        document.getElementById("message-input").value = "";
    }
});

socket.on("chat-message", ({ username, message }) => {
    const msgDiv = document.createElement("div");
    msgDiv.textContent = `${username}: ${message}`;
    document.getElementById("chat-messages").appendChild(msgDiv);
});
