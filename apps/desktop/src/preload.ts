import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('veoFarmDesktop', {
  setCurrentUser: (userId: string | null) => ipcRenderer.invoke('vf:set-user', userId),
  getAppVersion: () => ipcRenderer.invoke('vf:get-version'),
  update: {
    getStatus: () => ipcRenderer.invoke('vf:update-status'),
    check: () => ipcRenderer.invoke('vf:update-check'),
    install: () => ipcRenderer.invoke('vf:update-install'),
    onEvent: (cb: (payload: unknown) => void) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const handler = (_e: unknown, payload: any) => cb(payload);
      ipcRenderer.on('vf:update-event', handler);
      return () => ipcRenderer.off('vf:update-event', handler);
    },
  },
});
