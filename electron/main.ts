import { ensureEnvLoaded } from "../src/main/env";
import { app } from "electron";
import { bootstrapApp } from "../src/main/app/bootstrap";

ensureEnvLoaded();

void bootstrapApp(app);
