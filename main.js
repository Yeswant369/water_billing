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
let serverPort;

function createWindow() {
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

  mainWindow.loadURL(`http://localhost:${serverPort}`);

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http')) shell.openExternal(url);
    return { action: 'allow' };
  });

  mainWindow.on('closed', () => { mainWindow = null; });
}

// Wait for both Electron app ready AND Express server ready
let appReady = false;
let serverReady = false;

function tryCreateWindow() {
  if (appReady && serverReady && !mainWindow) {
    createWindow();
  }
}

server = expressApp.listen(0, () => {
  serverPort = server.address().port;
  console.log(`Server running on port ${serverPort}`);
  serverReady = true;
  tryCreateWindow();
});

app.whenReady().then(() => {
  appReady = true;
  tryCreateWindow();
});

app.on('window-all-closed', () => {
  server.close();
  app.quit();
});

app.on('activate', () => {
  if (mainWindow === null) createWindow();
});
