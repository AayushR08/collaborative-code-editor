const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const { exec } = require('child_process');
const fs = require('fs');
const os = require('os');
const crypto = require('crypto');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json()); // For parsing JSON in API requests

// Store active rooms and their data
const rooms = {};

// Create temp directory for code execution if it doesn't exist
const tempDir = path.join(os.tmpdir(), 'code-editor-executions');
if (!fs.existsSync(tempDir)) {
  fs.mkdirSync(tempDir);
}

// Track version history
const saveVersion = (roomId) => {
  if (rooms[roomId]) {
    const timestamp = new Date().toISOString();
    if (!rooms[roomId].versionHistory) {
      rooms[roomId].versionHistory = [];
    }
    
    // Create a new version entry
    const version = {
      id: crypto.randomUUID(),
      timestamp: timestamp,
      content: rooms[roomId].content,
      author: 'System', // In a real app, this would be the current user
      language: rooms[roomId].language || 'javascript'
    };
    
    // Add to history and limit the size
    rooms[roomId].versionHistory.unshift(version);
    
    // Keep only the latest 20 versions
    if (rooms[roomId].versionHistory.length > 20) {
      rooms[roomId].versionHistory.pop();
    }
    
    return version;
  }
  return null;
};

// Setup API routes
app.post('/api/execute', async (req, res) => {
  const { code, language, roomId } = req.body;
  
  if (!code || !language) {
    return res.status(400).json({ error: 'Code and language are required' });
  }
  
  // Generate unique file name
  const fileId = crypto.randomBytes(8).toString('hex');
  let filePath;
  let command;
  
  try {
    switch (language) {
      case 'javascript':
        filePath = path.join(tempDir, `${fileId}.js`);
        fs.writeFileSync(filePath, code);
        command = `node ${filePath}`;
        break;
      case 'python':
        filePath = path.join(tempDir, `${fileId}.py`);
        fs.writeFileSync(filePath, code);
        command = `python ${filePath}`;
        break;
      case 'php':
        filePath = path.join(tempDir, `${fileId}.php`);
        fs.writeFileSync(filePath, code);
        command = `php ${filePath}`;
        break;
      default:
        return res.status(400).json({ error: 'Unsupported language' });
    }
    
    // Execute code with timeout
    exec(command, { timeout: 5000 }, (error, stdout, stderr) => {
      // Clean up the temp file
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
      
      if (error) {
        return res.status(400).json({ error: error.message, stderr });
      }
      
      // Broadcast execution result to room if roomId is provided
      if (roomId && rooms[roomId]) {
        io.to(roomId).emit('execution-result', { stdout, stderr });
      }
      
      return res.json({ output: stdout, error: stderr });
    });
  } catch (err) {
    console.error('Execution error:', err);
    return res.status(500).json({ error: 'Server error during execution' });
  }
});

// Socket.io connection handler
io.on('connection', (socket) => {
  console.log('New user connected:', socket.id);
  
  // Join a coding room
  socket.on('join-room', (roomId, username, isReadOnly = false) => {
    socket.join(roomId);
    
    // Initialize room if it doesn't exist
    if (!rooms[roomId]) {
      rooms[roomId] = {
        users: {},
        content: '',
        language: 'javascript',
        chatMessages: [],
        versionHistory: [],
        files: {
          'main': {
            name: 'main',
            content: '',
            language: 'javascript'
          }
        },
        currentFile: 'main'
      };
      
      // Create initial version
      saveVersion(roomId);
    }
    
    // Add user to room
    rooms[roomId].users[socket.id] = {
      id: socket.id,
      username: username,
      cursorPosition: { line: 0, ch: 0 },
      isReadOnly: isReadOnly
    };
    
    // Let everyone know a new user joined
    io.to(roomId).emit('user-joined', rooms[roomId].users[socket.id]);
    
    // Send current room data to the new user
    socket.emit('room-data', {
      users: rooms[roomId].users,
      content: rooms[roomId].content,
      language: rooms[roomId].language,
      chatMessages: rooms[roomId].chatMessages,
      versionHistory: rooms[roomId].versionHistory,
      files: rooms[roomId].files,
      currentFile: rooms[roomId].currentFile
    });
    
    console.log(`${username} joined room ${roomId}`);
  });
  
  // Handle code changes
  socket.on('code-change', (roomId, newContent) => {
    if (rooms[roomId]) {
      // Check if user has read-only permissions
      if (rooms[roomId].users[socket.id]?.isReadOnly) {
        // Send current content back to the user to revert their changes
        socket.emit('code-update', rooms[roomId].content);
        return;
      }
      
      // Update current file content
      const currentFile = rooms[roomId].currentFile;
      if (rooms[roomId].files[currentFile]) {
        rooms[roomId].files[currentFile].content = newContent;
      }
      
      // Also update the main content for backward compatibility
      rooms[roomId].content = newContent;
      
      // Broadcast to all users in room except sender
      socket.to(roomId).emit('code-update', newContent);
      
      // Auto-save version periodically (we could use a debounce here in a real app)
      if (!rooms[roomId].saveTimeout) {
        rooms[roomId].saveTimeout = setTimeout(() => {
          saveVersion(roomId);
          delete rooms[roomId].saveTimeout;
        }, 5000); // Save every 5 seconds of inactivity
      }
    }
  });
  
  // Handle manual version saving
  socket.on('save-version', (roomId, versionName) => {
    if (rooms[roomId]) {
      const version = saveVersion(roomId);
      if (version) {
        version.name = versionName || `Version ${rooms[roomId].versionHistory.length}`;
        io.to(roomId).emit('version-saved', version);
      }
    }
  });
  
  // Handle version loading
  socket.on('load-version', (roomId, versionId) => {
    if (rooms[roomId] && rooms[roomId].versionHistory) {
      const version = rooms[roomId].versionHistory.find(v => v.id === versionId);
      if (version) {
        const currentFile = rooms[roomId].currentFile;
        
        // Update the content
        rooms[roomId].content = version.content;
        if (rooms[roomId].files[currentFile]) {
          rooms[roomId].files[currentFile].content = version.content;
        }
        
        // Notify all users
        io.to(roomId).emit('version-loaded', {
          versionId: versionId,
          content: version.content
        });
      }
    }
  });
  
  // Handle cursor position updates
  socket.on('cursor-move', (roomId, position) => {
    if (rooms[roomId] && rooms[roomId].users[socket.id]) {
      rooms[roomId].users[socket.id].cursorPosition = position;
      socket.to(roomId).emit('cursor-update', socket.id, position);
    }
  });
  
  // Handle language changes
  socket.on('language-change', (roomId, language) => {
    if (rooms[roomId]) {
      rooms[roomId].language = language;
      
      // Update current file language
      const currentFile = rooms[roomId].currentFile;
      if (rooms[roomId].files[currentFile]) {
        rooms[roomId].files[currentFile].language = language;
      }
      
      socket.to(roomId).emit('language-update', language);
    }
  });
  
  // Handle chat messages
  socket.on('send-message', (roomId, message) => {
    if (rooms[roomId]) {
      const username = rooms[roomId].users[socket.id]?.username || 'Anonymous';
      const timestamp = new Date().toISOString();
      const chatMessage = {
        sender: username,
        senderId: socket.id,
        text: message,
        timestamp: timestamp
      };
      
      // Add message to history
      rooms[roomId].chatMessages.push(chatMessage);
      
      // Keep only the latest 100 messages
      if (rooms[roomId].chatMessages.length > 100) {
        rooms[roomId].chatMessages.shift();
      }
      
      // Broadcast to all users in the room (including sender)
      io.to(roomId).emit('new-message', chatMessage);
    }
  });
  
  // Handle file operations
  socket.on('create-file', (roomId, fileName, language) => {
    if (rooms[roomId] && !rooms[roomId].files[fileName]) {
      rooms[roomId].files[fileName] = {
        name: fileName,
        content: '',
        language: language || 'javascript'
      };
      
      io.to(roomId).emit('file-created', rooms[roomId].files[fileName]);
    }
  });
  
  socket.on('switch-file', (roomId, fileName) => {
    if (rooms[roomId] && rooms[roomId].files[fileName]) {
      rooms[roomId].currentFile = fileName;
      
      socket.emit('file-switched', {
        fileName: fileName,
        content: rooms[roomId].files[fileName].content,
        language: rooms[roomId].files[fileName].language
      });
    }
  });
  
  socket.on('rename-file', (roomId, oldName, newName) => {
    if (rooms[roomId] && rooms[roomId].files[oldName] && !rooms[roomId].files[newName]) {
      // Copy the file with new name
      rooms[roomId].files[newName] = {
        ...rooms[roomId].files[oldName],
        name: newName
      };
      
      // Delete the old file
      delete rooms[roomId].files[oldName];
      
      // Update current file reference if needed
      if (rooms[roomId].currentFile === oldName) {
        rooms[roomId].currentFile = newName;
      }
      
      io.to(roomId).emit('file-renamed', { oldName, newName });
    }
  });
  
  socket.on('delete-file', (roomId, fileName) => {
    if (rooms[roomId] && rooms[roomId].files[fileName] && Object.keys(rooms[roomId].files).length > 1) {
      // Don't allow deleting the only file
      delete rooms[roomId].files[fileName];
      
      // Switch to another file if current file is deleted
      if (rooms[roomId].currentFile === fileName) {
        const newCurrent = Object.keys(rooms[roomId].files)[0];
        rooms[roomId].currentFile = newCurrent;
      }
      
      io.to(roomId).emit('file-deleted', {
        fileName: fileName,
        currentFile: rooms[roomId].currentFile,
        files: rooms[roomId].files
      });
    }
  });
  
  // Handle user disconnection
  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
    
    // Find and remove user from all rooms
    Object.keys(rooms).forEach(roomId => {
      if (rooms[roomId].users[socket.id]) {
        const username = rooms[roomId].users[socket.id].username;
        delete rooms[roomId].users[socket.id];
        io.to(roomId).emit('user-left', socket.id, username);
        
        // Clean up empty rooms
        if (Object.keys(rooms[roomId].users).length === 0) {
          delete rooms[roomId];
          console.log(`Room ${roomId} deleted (empty)`);
        }
      }
    });
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
// Additional code for /run endpoint
document.getElementById('run-btn').addEventListener('click', () => {
    const code = editor.getValue(); // ✅ get code from CodeMirror
    const language = document.getElementById('language-select').value; // ✅ get language from dropdown
  
    const outputPanel = document.getElementById('output-panel');
    const outputContent = document.getElementById('output-content');
    const errorBox = document.getElementById('error-message');
    const loader = document.getElementById('runner-loader');
  
    outputPanel.classList.add('hidden');
    errorBox.classList.add('hidden');
    loader.classList.remove('hidden');
  
    fetch('/run', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code, language })
    })
    .then(res => res.json())
    .then(result => {
      loader.classList.add('hidden');
      if (result.output || result.stderr) {
        outputPanel.classList.remove('hidden');
        outputContent.textContent = result.output || result.stderr;
      } else {
        throw new Error("No output received.");
      }
    })
    .catch(err => {
      loader.classList.add('hidden');
      errorBox.textContent = "Error: " + err.message;
      errorBox.classList.remove('hidden');
    });
  });
  