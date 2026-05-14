import { ensureEnvLoaded } from "../src/main/env";
import { app, BrowserWindow, protocol } from "electron";
import { bootstrapApp } from "../src/main/app/bootstrap";
import { revealMainWindow } from "../src/main/app/windows";

// Handle Squirrel.Mac events (required for electron-builder packaged apps).
if (process.platform === "darwin") {
  const squirrelEvent = process.argv.find((arg) => arg.startsWith("--squirrel-"));
  if (squirrelEvent !== undefined) {
    app.quit();
  }
}

// Register custom protocol as privileged (must be before ready event).
protocol.registerSchemesAsPrivileged([
  {
    scheme: "driftpet-pet",
    privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true },
  },
]);

ensureEnvLoaded();

const hasSingleInstanceLock = app.requestSingleInstanceLock();
if (!hasSingleInstanceLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    const existingWindow = BrowserWindow.getAllWindows()[0];
    if (existingWindow === undefined) {
      return;
    }

    revealMainWindow(existingWindow, { focus: true });
  });

  void bootstrapApp(app);
}
