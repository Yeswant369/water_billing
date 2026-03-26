const { app, BrowserWindow, shell } = require('electron');
const path = require('path');

// Start the Express server
const express = require('express');
const expressApp = express();
const { getDb } = require('./database');

expressApp.use(express.json());
expressApp.use(express.urlencoded({ extended: true }));
expressApp.use(express.static(path.join(__dirname, 'public')));

getDb();

expressApp.use('/api/consumers', require('./routes/consumers'));
expressApp.use('/api/readings', require('./routes/readings'));
expressApp.use('/api/bills', require('./routes/bills'));
expressApp.use('/api/payments', require('./routes/payments'));
expressApp.use('/api/settings', require('./routes/settings'));
expressApp.use('/api/custom', require('./routes/custom'));
expressApp.use('/api/print', require('./routes/print'));
expressApp.use('/api/reports', require('./routes/reports'));

expressApp.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

let mainWindow;
let server;

function createWindow(port) {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    title: 'Water Billing System - KNGIAS',
    icon: path.join(__dirname, 'build', 'icon.png'),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
    autoHideMenuBar: true,
  });

  mainWindow.loadURL(`http://localhost:${port}`);

  // Open external links in browser
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http')) shell.openExternal(url);
    return { action: 'allow' };
  });

  mainWindow.on('closed', () => { mainWindow = null; });
}

// Start Express on a free port, then create Electron window
server = expressApp.listen(0, () => {
  const port = server.address().port;
  console.log(`Server running on port ${port}`);
  createWindow(port);
});

app.on('window-all-closed', () => {
  server.close();
  app.quit();
});

app.on('activate', () => {
  if (mainWindow === null) createWindow(server.address().port);
});

app.whenReady().then(() => {
  // Window already created in server.listen callback
});
