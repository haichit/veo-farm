import { contextBridge, ipcRenderer } from 'electron';

// Bridge exposed to the embedded Next app. Used by the web layout to tell
// the Electron main process who is currently logged in so the worker
// subprocess can be respawned with WORKER_USER_ID — guarantees jobs only
// run on the machine of the user that owns them. Also exposes the app
// version so the UI can show the real packaged version, not a hardcoded
// string baked into the bundle.
contextBridge.exposeInMainWorld('veoFarmDesktop', {
  setCurrentUser: (userId: string | null) => ipcRenderer.invoke('vf:set-user', userId),
  getAppVersion: () => ipcRenderer.invoke('vf:get-version'),
});
