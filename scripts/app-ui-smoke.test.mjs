import test from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import fs from "node:fs/promises";
import { createRequire } from "node:module";
import { build } from "esbuild";
import { JSDOM } from "jsdom";
import React, { act } from "react";
import ReactDOMClient from "react-dom/client";

const rendererEntry = path.resolve("src/renderer/App.tsx");
const rendererPetUiState = path.resolve("src/renderer/pet-ui-state.ts");
const rendererStyles = path.resolve("src/renderer/styles.css");
const require = createRequire(import.meta.url);
const localTempRoot = path.resolve(".tmp");

const sampleCard = {
  id: 17,
  itemId: 9,
  title: "Ship product work instead of polishing infra",
  useFor: "Return to the core desk pet loop and stop widening the shell.",
  knowledgeTag: "thread reset",
  summaryForRetrieval: "ship product work stop polishing infra",
  related: [],
  petRemark: "This is the active thread.",
  createdAt: Date.now(),
};

const sampleStatus = {
  checkedAt: Date.now(),
  pet: {
    level: "ok",
    summary: "Pet is active.",
    detail: "Ready to surface cards.",
    enabled: true,
    hourlyBudget: 3,
    shownThisHour: 1,
    canSurfaceAuto: true,
    rememberedThread: {
      cardId: sampleCard.id,
      title: sampleCard.title,
      createdAt: sampleCard.createdAt,
    },
  },
  telegram: {
    level: "ok",
    summary: "Telegram is healthy.",
    detail: "Polling works.",
    enabled: true,
    lastUpdateId: 1,
    recentTelegramItems: 1,
    pollerState: "polling",
    lastPollAt: Date.now(),
    lastSuccessAt: Date.now(),
    lastError: null,
  },
  llm: {
    level: "ok",
    summary: "LLM is healthy.",
    detail: "Digest generation works.",
    enabled: true,
    provider: "test",
    digestModel: "test-digest",
    remarkModel: "test-remark",
  },
  embeddings: {
    level: "ok",
    summary: "Embeddings are healthy.",
    detail: "Recall index works.",
    enabled: true,
    provider: "test",
    model: "test-embedding",
    storedEmbeddings: 4,
  },
  storage: {
    level: "ok",
    summary: "Storage is healthy.",
    detail: "Cards are persisted.",
    items: 1,
    cards: 1,
    failedItems: 0,
    latestItem: {
      id: 9,
      title: sampleCard.title,
      source: "manual_chaos",
      status: "ready",
      receivedAt: Date.now(),
      rawUrl: null,
      rawText: sampleCard.useFor,
      tgMessageId: null,
      origin: "real",
      lastError: null,
      extraction: {
        hasUrl: false,
        rawUrl: null,
        extractedTitle: null,
        extractedTextPreview: null,
        extractionState: "not_applicable",
        stage: "not_applicable",
        detail: null,
      },
      card: {
        id: sampleCard.id,
        title: sampleCard.title,
        useFor: sampleCard.useFor,
        knowledgeTag: sampleCard.knowledgeTag,
        petRemark: sampleCard.petRemark,
        related: [],
      },
    },
  },
};

const buildAppModule = async () => {
  await fs.mkdir(localTempRoot, { recursive: true });
  const tempDir = await fs.mkdtemp(path.join(localTempRoot, "driftpet-ui-smoke-"));
  const outfile = path.join(tempDir, "App.cjs");

  await build({
    entryPoints: [rendererEntry],
    bundle: true,
    format: "cjs",
    platform: "node",
    outfile,
    jsx: "automatic",
    loader: {
      ".css": "text",
      ".webp": "file",
      ".tsx": "tsx",
    },
    external: ["react", "react/jsx-runtime", "react/jsx-dev-runtime"],
  });

  const moduleExports = require(outfile);
  return {
    App: moduleExports.default ?? moduleExports,
    cleanupBundle: async () => {
      await fs.rm(tempDir, { recursive: true, force: true });
    },
  };
};

const buildPetUiStateModule = async () => {
  await fs.mkdir(localTempRoot, { recursive: true });
  const tempDir = await fs.mkdtemp(path.join(localTempRoot, "driftpet-ui-state-"));
  const outfile = path.join(tempDir, "pet-ui-state.cjs");

  await build({
    entryPoints: [rendererPetUiState],
    bundle: true,
    format: "cjs",
    platform: "node",
    outfile,
    loader: {
      ".ts": "ts",
    },
  });

  const moduleExports = require(outfile);
  return {
    petUiState: moduleExports,
    cleanupBundle: async () => {
      await fs.rm(tempDir, { recursive: true, force: true });
    },
  };
};

const setupDom = () => {
  const dom = new JSDOM("<!doctype html><html><body><div id=\"root\"></div></body></html>", {
    url: "http://127.0.0.1:5173",
    pretendToBeVisual: true,
  });

  Object.defineProperty(globalThis, "window", { configurable: true, value: dom.window });
  Object.defineProperty(globalThis, "document", { configurable: true, value: dom.window.document });
  Object.defineProperty(globalThis, "navigator", { configurable: true, value: dom.window.navigator });
  Object.defineProperty(globalThis, "HTMLElement", { configurable: true, value: dom.window.HTMLElement });
  Object.defineProperty(globalThis, "Node", { configurable: true, value: dom.window.Node });
  Object.defineProperty(globalThis, "Event", { configurable: true, value: dom.window.Event });
  Object.defineProperty(globalThis, "MouseEvent", { configurable: true, value: dom.window.MouseEvent });
  Object.defineProperty(globalThis, "PointerEvent", { configurable: true, value: dom.window.MouseEvent });
  Object.defineProperty(globalThis, "requestAnimationFrame", {
    configurable: true,
    value: dom.window.requestAnimationFrame.bind(dom.window),
  });
  Object.defineProperty(globalThis, "cancelAnimationFrame", {
    configurable: true,
    value: dom.window.cancelAnimationFrame.bind(dom.window),
  });
  Object.defineProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT", { configurable: true, value: true });

  let cleanupListener = () => {};
  let clipboardOfferEmitter = null;
  const setWindowSizeCalls = [];
  const setMiniBubbleVisibleCalls = [];
  const moveWindowByCalls = [];
  const dispatchClaudeCodeCalls = [];
  const deleteCardCalls = [];
  const claudeDispatchSettingWrites = [];
  let latestClaudeDispatch = null;
  let claudeDispatchSettings = {
    terminalApp: "Ghostty",
    workingDirectory: "/Users/mac/driftpet",
    continuityMode: "continuous",
  };

  if (!dom.window.HTMLElement.prototype.setPointerCapture) {
    dom.window.HTMLElement.prototype.setPointerCapture = function setPointerCapture(pointerId) {
      this.__pointerCaptureId = pointerId;
    };
  }

  if (!dom.window.HTMLElement.prototype.releasePointerCapture) {
    dom.window.HTMLElement.prototype.releasePointerCapture = function releasePointerCapture(pointerId) {
      if (this.__pointerCaptureId === pointerId) {
        delete this.__pointerCaptureId;
      }
    };
  }

  if (!dom.window.HTMLElement.prototype.hasPointerCapture) {
    dom.window.HTMLElement.prototype.hasPointerCapture = function hasPointerCapture(pointerId) {
      return this.__pointerCaptureId === pointerId;
    };
  }

  window.driftpet = {
    showDemo: async () => sampleCard,
    listRecentCards: async () => [{
      ...sampleCard,
      latestClaudeDispatch,
    }],
    deleteCard: async (cardId) => {
      deleteCardCalls.push(cardId);
      return true;
    },
    getStatus: async () => sampleStatus,
    getClaudeDispatchSettings: async () => claudeDispatchSettings,
    setClaudeDispatchSettings: async (settings) => {
      claudeDispatchSettingWrites.push(settings);
      claudeDispatchSettings = settings;
      return claudeDispatchSettings;
    },
    ingestChaosReset: async () => sampleCard,
    dispatchClaudeCode: async (cardId) => {
      dispatchClaudeCodeCalls.push(cardId);
      latestClaudeDispatch = {
        command: `claude mock-dispatch ${cardId}`,
        promptPath: `/tmp/card-${cardId}.md`,
        runner: "claude-test",
        cwd: "/tmp/driftpet-worktree",
        createdAt: Date.now(),
        status: "launched",
      };
      return latestClaudeDispatch;
    },
    setPetHourlyBudget: async () => 3,
    setWindowSize: async (windowSize) => {
      setWindowSizeCalls.push(windowSize);
    },
    setMiniBubbleVisible: async (visible) => {
      setMiniBubbleVisibleCalls.push(visible);
    },
    moveWindowBy: (deltaX, deltaY) => {
      moveWindowByCalls.push([deltaX, deltaY]);
    },
    petList: async () => [{ slug: "boba", displayName: "Boba", isBuiltin: true }],
    petActive: async () => ({ slug: "boba", spritesheetPath: "" }),
    petSetActive: async () => {},
    petInstall: async () => ({ slug: "boba", displayName: "Boba" }),
    onCardCreated: (listener) => {
      cleanupListener = () => {
        void listener;
      };
      return cleanupListener;
    },
    onClipboardOffer: (listener) => {
      clipboardOfferEmitter = listener;
      return () => {
        clipboardOfferEmitter = null;
      };
    },
    onPetActiveChanged: () => () => {},
  };

  return {
    dom,
    setWindowSizeCalls,
    setMiniBubbleVisibleCalls,
    moveWindowByCalls,
    dispatchClaudeCodeCalls,
    deleteCardCalls,
    claudeDispatchSettingWrites,
    emitClipboardOffer: (offer) => {
      if (clipboardOfferEmitter !== null) {
        clipboardOfferEmitter(offer);
      }
    },
    cleanup: () => {
      cleanupListener();
      dom.window.close();
      delete globalThis.window;
      delete globalThis.document;
      delete globalThis.navigator;
      delete globalThis.HTMLElement;
      delete globalThis.Node;
      delete globalThis.Event;
      delete globalThis.MouseEvent;
      delete globalThis.PointerEvent;
      delete globalThis.requestAnimationFrame;
      delete globalThis.cancelAnimationFrame;
      delete globalThis.IS_REACT_ACT_ENVIRONMENT;
    },
  };
};

const dispatchPointer = (target, type, options = {}) => {
  const clientX = options.clientX ?? 0;
  const clientY = options.clientY ?? 0;
  const event = new MouseEvent(type, {
    bubbles: true,
    cancelable: true,
    clientX,
    clientY,
    screenX: options.screenX ?? clientX,
    screenY: options.screenY ?? clientY,
    button: 0,
    ...options,
  });
  Object.defineProperty(event, "pointerId", {
    configurable: true,
    value: options.pointerId ?? 1,
  });
  target.dispatchEvent(event);
};

const getCssBlock = (css, selector) => {
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = css.match(new RegExp(`${escapedSelector}\\s*\\{(?<body>[^}]+)\\}`));
  assert.ok(match?.groups?.body, `expected CSS block for ${selector}`);
  return match.groups.body;
};

const getAvatarButton = (container) => {
  const avatarButton = container.querySelector(".pet-avatar-button");
  assert.ok(avatarButton, "expected clickable pet avatar");
  return avatarButton;
};

const clickAvatar = async (container) => {
  const avatarButton = getAvatarButton(container);

  await act(async () => {
    avatarButton.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await new Promise((resolve) => setTimeout(resolve, 220));
  });

  return avatarButton;
};

const openNestWithContextMenu = async (container) => {
  const avatarButton = getAvatarButton(container);

  await act(async () => {
    avatarButton.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true }));
  });

  return avatarButton;
};

const collapseNest = async (container) => {
  const collapseButton = container.querySelector("button.workbench-return");
  assert.ok(collapseButton, "expected workbench collapse button");

  await act(async () => {
    collapseButton.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
};

test("mini mode stays pure pet, click bubbles, right click opens the nest", async () => {
  const { App, cleanupBundle } = await buildAppModule();
  const { cleanup, setWindowSizeCalls, setMiniBubbleVisibleCalls } = setupDom();
  const container = document.getElementById("root");
  assert.ok(container);

  const root = ReactDOMClient.createRoot(container);

  await act(async () => {
    root.render(React.createElement(App));
  });

  assert.ok(container.querySelector(".pet-shell-mini"), "expected mini shell in initial mode");
  assert.ok(container.querySelector(".pet-avatar-button"), "expected Boba avatar in initial mini mode");
  assert.equal(container.querySelector(".pet-titlebar"), null, "mini mode should not show a titlebar");
  assert.equal(container.querySelector(".mini-card"), null, "mini mode should not show a mini card");
  assert.equal(container.querySelector(".mini-pet-toast"), null, "mini mode should not show a mini toast");
  assert.equal(container.querySelector(".bubble-panel"), null, "mini mode should not show the main bubble");
  assert.equal(container.querySelector(".pet-mini-resume-thread")?.textContent.includes("上次那条线"), true, "mini mode may show the remembered-thread resume entry");

  await clickAvatar(container);

  assert.deepEqual(setWindowSizeCalls, [], "single click should not open a panel");
  assert.ok(container.querySelector(".pet-click-bubble"), "expected a small click bubble after poking Boba");
  assert.ok(container.querySelector(".app-shell-mini-bubble"), "expected mini window to reserve separate space for the click bubble");
  assert.equal(setMiniBubbleVisibleCalls.at(-1), true, "expected the mini window to expand while the click bubble is visible");
  assert.ok(container.querySelector(".pet-shell-mini"), "single click should keep mini mode");

  await openNestWithContextMenu(container);

  assert.deepEqual(setWindowSizeCalls, ["expanded"]);
  assert.ok(
    !setMiniBubbleVisibleCalls.includes(false),
    "leaving mini mode must not fire setMiniBubbleVisible(false); that IPC resizes the window back to mini and shrinks the just-expanded nest"
  );
  assert.ok(container.querySelector(".pet-shell-expanded"), "expected double click to open the nest");
  assert.ok(container.querySelector(".pet-workbench"), "expected expanded mode to show the workbench");
  assert.equal(container.querySelector(".pet-avatar-button"), null, "expected nest panel to hide the animated pet");

  await act(async () => {
    root.unmount();
  });

  cleanup();
  await cleanupBundle();
});

test("clipboard offer survives the mini handoff and appears in the workbench strip", async () => {
  const { App, cleanupBundle } = await buildAppModule();
  const { cleanup, setWindowSizeCalls, emitClipboardOffer } = setupDom();
  const container = document.getElementById("root");
  assert.ok(container);

  const root = ReactDOMClient.createRoot(container);

  await act(async () => {
    root.render(React.createElement(App));
  });

  await act(async () => {
    emitClipboardOffer({ text: "An interesting paragraph the user just copied from a doc.", capturedAt: Date.now() });
  });

  assert.equal(container.querySelector(".pet-clipboard-offer"), null, "mini mode should no longer show the clipboard bubble");
  assert.equal(container.querySelector(".pet-workbench-clipboard"), null, "workbench clipboard strip should stay hidden until the nest opens");

  await openNestWithContextMenu(container);

  assert.deepEqual(setWindowSizeCalls, ["expanded"]);
  const workbenchOffer = container.querySelector(".pet-workbench-clipboard");
  assert.ok(workbenchOffer, "expected the clipboard strip to appear at the top of the workbench");
  assert.match(workbenchOffer.textContent ?? "", /剪贴板/);
  assert.match(workbenchOffer.textContent ?? "", /An interesting paragraph/);

  const dismiss = workbenchOffer.querySelector(".pet-workbench-clipboard-dismiss");
  assert.ok(dismiss);
  await act(async () => {
    dismiss.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
  assert.equal(container.querySelector(".pet-workbench-clipboard"), null, "dismiss should remove the workbench clipboard strip");

  await act(async () => {
    root.unmount();
  });

  cleanup();
  await cleanupBundle();
});

test("accepting a clipboard offer from the workbench fills the textarea without re-expanding", async () => {
  const { App, cleanupBundle } = await buildAppModule();
  const { cleanup, setWindowSizeCalls, emitClipboardOffer } = setupDom();
  const container = document.getElementById("root");
  assert.ok(container);

  const root = ReactDOMClient.createRoot(container);

  await act(async () => {
    root.render(React.createElement(App));
  });

  await act(async () => {
    emitClipboardOffer({ text: "Second copy: tighten the next driftpet card.", capturedAt: Date.now() });
  });

  await openNestWithContextMenu(container);

  assert.deepEqual(setWindowSizeCalls, ["expanded"], "opening the nest should be the only resize");
  const workbenchOffer = container.querySelector(".pet-workbench-clipboard");
  assert.ok(workbenchOffer);

  const acceptOffer = workbenchOffer.querySelector(".pet-workbench-clipboard-accept");
  assert.ok(acceptOffer);
  await act(async () => {
    acceptOffer.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });

  assert.deepEqual(setWindowSizeCalls, ["expanded"], "accepting in the workbench should not trigger a second expand");
  assert.equal(container.querySelector(".pet-workbench-clipboard"), null, "accept should clear the clipboard strip");
  const textarea = container.querySelector("textarea");
  assert.ok(textarea, "workbench textarea should be visible after expanding");
  assert.equal(textarea.value, "Second copy: tighten the next driftpet card.", "textarea should be pre-filled with the copied text");

  await act(async () => {
    root.unmount();
  });

  cleanup();
  await cleanupBundle();
});

test("right click opens the nest from pure mini mode", async () => {
  const { App, cleanupBundle } = await buildAppModule();
  const { cleanup, setWindowSizeCalls } = setupDom();
  const container = document.getElementById("root");
  assert.ok(container);

  const root = ReactDOMClient.createRoot(container);

  await act(async () => {
    root.render(React.createElement(App));
  });

  await openNestWithContextMenu(container);

  assert.deepEqual(setWindowSizeCalls, ["expanded"]);
  assert.ok(container.querySelector(".pet-shell-expanded"), "expected right click to open the nest");
  assert.ok(container.querySelector(".pet-workbench"), "expected right click to expose the workbench");
  assert.equal(container.querySelector(".pet-avatar-button"), null, "expected nest panel to hide the animated pet");

  await act(async () => {
    root.unmount();
  });

  cleanup();
  await cleanupBundle();
});

test("mini resume thread opens the remembered card directly", async () => {
  const { App, cleanupBundle } = await buildAppModule();
  const { cleanup, setWindowSizeCalls } = setupDom();
  const container = document.getElementById("root");
  assert.ok(container);

  const root = ReactDOMClient.createRoot(container);

  await act(async () => {
    root.render(React.createElement(App));
    await Promise.resolve();
    await Promise.resolve();
  });

  const resumeThread = container.querySelector(".pet-mini-resume-thread");
  assert.ok(resumeThread, "expected mini mode to expose the remembered thread");
  assert.match(resumeThread.textContent ?? "", /上次那条线/);
  assert.match(resumeThread.textContent ?? "", /继续/);

  await act(async () => {
    resumeThread.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await Promise.resolve();
    await Promise.resolve();
  });

  assert.deepEqual(setWindowSizeCalls, ["compact"], "resuming from mini should open the compact card");
  assert.ok(container.querySelector(".pet-shell-compact"), "expected compact shell after resuming the thread");
  assert.match(container.textContent ?? "", /Ship product work instead of polishing infra/);
  assert.match(container.textContent ?? "", /Return to the core desk pet loop/);

  await act(async () => {
    root.unmount();
  });

  cleanup();
  await cleanupBundle();
});

test("nest panel exposes history drawer", async () => {
  const { App, cleanupBundle } = await buildAppModule();
  const { cleanup, setWindowSizeCalls } = setupDom();
  const container = document.getElementById("root");
  assert.ok(container);

  const root = ReactDOMClient.createRoot(container);

  await act(async () => {
    root.render(React.createElement(App));
  });

  await openNestWithContextMenu(container);

  assert.deepEqual(setWindowSizeCalls, ["expanded"]);
  assert.ok(container.querySelector(".pet-shell-expanded"), "expected expanded shell after opening the nest");
  assert.equal(container.querySelector(".pet-titlebar"), null, "expected expanded nest to avoid a separate titlebar layer");
  assert.equal(container.querySelector(".bubble-panel-expanded"), null, "expected expanded nest to avoid a separate speech-bubble layer");
  assert.equal(container.querySelector(".pet-avatar-button"), null, "expected expanded nest to omit the pet animation");
  assert.ok(container.querySelector(".pet-workbench-toolbar"), "expected toolbar integrated in workbench header");

  const logToggle = Array.from(container.querySelectorAll("button")).find((button) => button.textContent?.includes("记忆"));
  assert.ok(logToggle, "expected show log button");

  await act(async () => {
    logToggle.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });

  const historyDrawer = container.querySelector(".history-drawer.open");
  assert.ok(historyDrawer, "expected history drawer to open");

  const backButton = Array.from(historyDrawer.querySelectorAll("button")).find((button) => button.textContent?.includes("返回"));
  assert.ok(backButton, "expected back button in log drawer");

  await act(async () => {
    backButton.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });

  assert.equal(container.querySelector(".history-drawer.open"), null, "expected history drawer to close on back");

  await act(async () => {
    logToggle.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });

  const historyCard = container.querySelector(".history-card");
  assert.ok(historyCard, "expected a selectable history card");

  await act(async () => {
    historyCard.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });

  assert.equal(container.querySelector(".history-drawer.open"), null, "expected selecting a card to close history drawer");
  assert.match(container.textContent ?? "", /Ship product work instead of polishing infra/);

  assert.equal(container.querySelector(".status-panel"), null, "status panel should not exist");

  await act(async () => {
    root.unmount();
  });

  cleanup();
  await cleanupBundle();
});

test("history drawer can dispatch a card to Claude Code", async () => {
  const { App, cleanupBundle } = await buildAppModule();
  const { cleanup, dispatchClaudeCodeCalls, setWindowSizeCalls } = setupDom();
  const container = document.getElementById("root");
  assert.ok(container);

  const root = ReactDOMClient.createRoot(container);

  await act(async () => {
    root.render(React.createElement(App));
  });

  await openNestWithContextMenu(container);
  assert.deepEqual(setWindowSizeCalls, ["expanded"]);

  const logToggle = Array.from(container.querySelectorAll("button")).find((button) => button.textContent?.includes("记忆"));
  assert.ok(logToggle, "expected show log button");

  await act(async () => {
    logToggle.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });

  const dispatchButton = Array.from(container.querySelectorAll("button")).find((button) => button.textContent?.includes("派给 Claude Code"));
  assert.ok(dispatchButton, "expected Claude Code dispatch button");

  await act(async () => {
    dispatchButton.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await Promise.resolve();
    await Promise.resolve();
  });

  assert.deepEqual(dispatchClaudeCodeCalls, [sampleCard.id], "expected dispatch to receive the selected card id");
  assert.match(container.textContent ?? "", /已派给 Claude Code：claude-test/, "expected in-panel dispatch feedback");
  assert.match(container.textContent ?? "", /Claude 已启动/, "expected latest dispatch state to stay visible on the card");

  await act(async () => {
    root.unmount();
  });

  cleanup();
  await cleanupBundle();
});

test("history drawer can delete a remembered card", async () => {
  const { App, cleanupBundle } = await buildAppModule();
  const { cleanup, deleteCardCalls, setWindowSizeCalls } = setupDom();
  const container = document.getElementById("root");
  assert.ok(container);

  const root = ReactDOMClient.createRoot(container);

  await act(async () => {
    root.render(React.createElement(App));
  });

  await openNestWithContextMenu(container);
  assert.deepEqual(setWindowSizeCalls, ["expanded"]);

  const logToggle = Array.from(container.querySelectorAll("button")).find((button) => button.textContent?.includes("记忆"));
  assert.ok(logToggle, "expected show log button");

  await act(async () => {
    logToggle.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });

  const deleteButton = Array.from(container.querySelectorAll("button")).find((button) => button.textContent?.trim() === "删除");
  assert.ok(deleteButton, "expected delete button");

  await act(async () => {
    deleteButton.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await Promise.resolve();
    await Promise.resolve();
  });

  assert.deepEqual(deleteCardCalls, [sampleCard.id], "expected delete to receive the selected card id");
  assert.equal(container.querySelector(".history-card"), null, "expected deleted card to disappear from history");

  await act(async () => {
    root.unmount();
  });

  cleanup();
  await cleanupBundle();
});

test("settings panel can switch Claude terminal and working directory", async () => {
  const { App, cleanupBundle } = await buildAppModule();
  const { cleanup, claudeDispatchSettingWrites, setWindowSizeCalls } = setupDom();
  const container = document.getElementById("root");
  assert.ok(container);

  const root = ReactDOMClient.createRoot(container);

  await act(async () => {
    root.render(React.createElement(App));
  });

  await openNestWithContextMenu(container);
  assert.deepEqual(setWindowSizeCalls, ["expanded"]);

  const settingsButton = Array.from(container.querySelectorAll("button")).find((button) => button.textContent?.includes("设置"));
  assert.ok(settingsButton, "expected settings button");

  await act(async () => {
    settingsButton.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await Promise.resolve();
  });

  assert.match(container.textContent ?? "", /Claude Code/, "expected Claude settings section");

  const terminalButton = Array.from(container.querySelectorAll("button")).find((button) => button.textContent?.trim() === "Terminal");
  assert.ok(terminalButton, "expected Terminal toggle");

  await act(async () => {
    terminalButton.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await Promise.resolve();
    await Promise.resolve();
  });

  const cwdInput = Array.from(container.querySelectorAll("input")).find((input) => input.placeholder === "/absolute/path/to/project");
  assert.ok(cwdInput, "expected Claude working directory input");

  const isolatedModeButton = Array.from(container.querySelectorAll("button")).find((button) => button.textContent?.trim() === "独立卡片");
  assert.ok(isolatedModeButton, "expected isolated continuity mode toggle");

  await act(async () => {
    isolatedModeButton.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await Promise.resolve();
  });

  await act(async () => {
    cwdInput.value = "/tmp/claude-project";
    cwdInput.dispatchEvent(new Event("input", { bubbles: true }));
    cwdInput.dispatchEvent(new Event("change", { bubbles: true }));
    await Promise.resolve();
  });
  assert.equal(cwdInput.value, "/tmp/claude-project");

  const saveClaudeSettingsButton = Array.from(container.querySelectorAll("button")).find((button) => button.textContent?.includes("保存 Claude 设置"));
  assert.ok(saveClaudeSettingsButton, "expected Claude settings save button");

  await act(async () => {
    saveClaudeSettingsButton.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await Promise.resolve();
    await Promise.resolve();
  });

  assert.deepEqual(claudeDispatchSettingWrites[0], {
    continuityMode: "continuous",
    terminalApp: "Terminal",
    workingDirectory: "/Users/mac/driftpet",
  });
  assert.deepEqual(claudeDispatchSettingWrites[1], {
    continuityMode: "isolated",
    terminalApp: "Terminal",
    workingDirectory: "/Users/mac/driftpet",
  });
  assert.ok(claudeDispatchSettingWrites.length >= 2, "expected at least two settings writes");

  await act(async () => {
    root.unmount();
  });

  cleanup();
  await cleanupBundle();
});

test("settings panel exposes a vertical scroll container", async () => {
  const css = await fs.readFile(rendererStyles, "utf8");
  const panelBlock = Array.from(css.matchAll(/\.pet-skin-panel\s*\{[^}]*\}/g)).at(-1)?.[0] ?? "";

  assert.match(panelBlock, /overflow-y:\s*auto/, "expected settings panel to scroll vertically");
  assert.match(panelBlock, /max-height:\s*min\(100%,\s*332px\)/, "expected settings panel to keep a bounded height");
  assert.match(css, /\.pet-skin-panel::\-webkit-scrollbar\s*\{[^}]*width:\s*10px;/, "expected explicit vertical scrollbar width");
});

test("workbench can capture a note after opening from the avatar", async () => {
  const { App, cleanupBundle } = await buildAppModule();
  const { cleanup, setWindowSizeCalls } = setupDom();
  const container = document.getElementById("root");
  assert.ok(container);

  const root = ReactDOMClient.createRoot(container);

  await act(async () => {
    root.render(React.createElement(App));
  });

  await openNestWithContextMenu(container);

  assert.deepEqual(setWindowSizeCalls, ["expanded"]);
  assert.ok(container.querySelector(".pet-shell-expanded"), "expected shell to switch to expanded mode after open bench");
  assert.ok(container.querySelector(".pet-workbench"), "expected expanded mode to show the workbench");
  assert.equal(container.querySelector(".pet-avatar-button"), null, "expected workbench to stay a function panel without pet animation");

  const templateButton = Array.from(container.querySelectorAll("button")).find((button) => button.textContent?.includes("东西太多"));
  assert.ok(templateButton, "expected quick template button");

  await act(async () => {
    templateButton.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });

  const textarea = container.querySelector("textarea");
  assert.ok(textarea, "expected workbench textarea");
  assert.match(textarea.value, /我现在想做的事：/);

  const submitButton = Array.from(container.querySelectorAll("button")).find((button) => button.textContent?.includes("保存到小窝"));
  assert.ok(submitButton, "expected submit button");

  await act(async () => {
    submitButton.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await Promise.resolve();
  });

  assert.equal(container.querySelector(".bubble-panel"), null, "expected expanded workbench to stay a single function surface after saving");
  assert.match(container.textContent ?? "", /保存到小窝|正在保存/);

  await act(async () => {
    root.unmount();
  });

  cleanup();
  await cleanupBundle();
});

test("pet avatar reacts to hover and drag by moving the window and switching run state", async () => {
  const { App, cleanupBundle } = await buildAppModule();
  const { cleanup, setWindowSizeCalls, moveWindowByCalls } = setupDom();
  const container = document.getElementById("root");
  assert.ok(container);

  const root = ReactDOMClient.createRoot(container);

  await act(async () => {
    root.render(React.createElement(App));
  });

  const avatarButton = container.querySelector(".pet-avatar-button");
  assert.ok(avatarButton, "expected pet avatar button");

  await act(async () => {
    dispatchPointer(avatarButton, "pointerover");
  });

  assert.match(avatarButton.className, /pet-hovered/, "expected hover class when the cursor reaches the pet");

  await act(async () => {
    dispatchPointer(avatarButton, "pointerdown", { clientX: 120, clientY: 120, pointerId: 7 });
    dispatchPointer(avatarButton, "pointermove", { clientX: 132, clientY: 118, pointerId: 7 });
    dispatchPointer(avatarButton, "pointermove", { clientX: 146, clientY: 118, pointerId: 7 });
    await new Promise((resolve) => requestAnimationFrame(resolve));
  });

  assert.match(avatarButton.className, /pet-dragging/, "expected dragging class after moving past the threshold");
  assert.match(avatarButton.className, /pet-run-right/, "expected run-right class while dragging to the right");
  assert.deepEqual(moveWindowByCalls, [[26, -2]]);

  await act(async () => {
    dispatchPointer(avatarButton, "pointermove", { clientX: 144, clientY: 118, pointerId: 7 });
    await new Promise((resolve) => requestAnimationFrame(resolve));
  });

  assert.match(avatarButton.className, /pet-run-right/, "expected tiny reverse jitter not to flip the run animation");

  await act(async () => {
    dispatchPointer(avatarButton, "pointerup", { clientX: 146, clientY: 118, pointerId: 7 });
    avatarButton.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await new Promise((resolve) => setTimeout(resolve, 0));
  });

  assert.deepEqual(setWindowSizeCalls, [], "expected drag release to suppress any avatar click action");
  assert.doesNotMatch(avatarButton.className, /pet-dragging/, "expected dragging class to clear on release");

  await act(async () => {
    dispatchPointer(avatarButton, "pointerout", { pointerId: 7 });
  });

  assert.doesNotMatch(avatarButton.className, /pet-hovered/, "expected hover class to clear after pointer leave");

  await act(async () => {
    root.unmount();
  });

  cleanup();
  await cleanupBundle();
});

test("pet drag direction follows screen movement instead of window-relative jitter", async () => {
  const { App, cleanupBundle } = await buildAppModule();
  const { cleanup, moveWindowByCalls } = setupDom();
  const container = document.getElementById("root");
  assert.ok(container);

  const root = ReactDOMClient.createRoot(container);

  await act(async () => {
    root.render(React.createElement(App));
  });

  const avatarButton = getAvatarButton(container);

  await act(async () => {
    dispatchPointer(avatarButton, "pointerdown", {
      clientX: 120,
      clientY: 120,
      screenX: 500,
      screenY: 500,
      pointerId: 10,
    });
    dispatchPointer(avatarButton, "pointermove", {
      clientX: 132,
      clientY: 120,
      screenX: 512,
      screenY: 500,
      pointerId: 10,
    });
    dispatchPointer(avatarButton, "pointermove", {
      clientX: 126,
      clientY: 120,
      screenX: 526,
      screenY: 500,
      pointerId: 10,
    });
    await new Promise((resolve) => requestAnimationFrame(resolve));
  });

  assert.match(avatarButton.className, /pet-run-right/, "expected screen-right movement to stay on the right-facing run");
  assert.deepEqual(moveWindowByCalls, [[26, 0]], "expected window movement to use screen-space deltas");

  await act(async () => {
    root.unmount();
  });

  cleanup();
  await cleanupBundle();
});

test("pet avatar has distinct upward and downward drag states", async () => {
  const { App, cleanupBundle } = await buildAppModule();
  const { cleanup } = setupDom();
  const container = document.getElementById("root");
  assert.ok(container);

  const root = ReactDOMClient.createRoot(container);

  await act(async () => {
    root.render(React.createElement(App));
  });

  const avatarButton = getAvatarButton(container);

  await act(async () => {
    dispatchPointer(avatarButton, "pointerdown", { clientX: 120, clientY: 120, pointerId: 8 });
    dispatchPointer(avatarButton, "pointermove", { clientX: 120, clientY: 104, pointerId: 8 });
    await new Promise((resolve) => requestAnimationFrame(resolve));
  });

  assert.match(avatarButton.className, /pet-run-up/, "expected clear upward drag to use the upward animation");

  await act(async () => {
    dispatchPointer(avatarButton, "pointerup", { clientX: 120, clientY: 104, pointerId: 8 });
    await new Promise((resolve) => setTimeout(resolve, 0));
  });

  await act(async () => {
    dispatchPointer(avatarButton, "pointerdown", { clientX: 120, clientY: 120, pointerId: 9 });
    dispatchPointer(avatarButton, "pointermove", { clientX: 120, clientY: 138, pointerId: 9 });
    await new Promise((resolve) => requestAnimationFrame(resolve));
  });

  assert.match(avatarButton.className, /pet-run-down/, "expected clear downward drag to use the downward animation");

  await act(async () => {
    root.unmount();
  });

  cleanup();
  await cleanupBundle();
});

test("pet sprite rows match the Petdex Boba state order", async () => {
  const css = await fs.readFile(rendererStyles, "utf8");

  assert.match(getCssBlock(css, ".pet-sprite-idle"), /--sprite-row:\s*0;/, "row 0 = idle");
  assert.match(getCssBlock(css, ".pet-run-right .pet-sprite"), /--sprite-row:\s*1;/, "row 1 = run-right");
  assert.match(getCssBlock(css, ".pet-run-left .pet-sprite"), /--sprite-row:\s*2;/, "row 2 = run-left");
  assert.match(getCssBlock(css, ".pet-wave .pet-sprite"), /--sprite-row:\s*3;/, "row 3 = waving");
  assert.match(getCssBlock(css, ".pet-sprite-jumping"), /--sprite-row:\s*4;/, "row 4 = jumping");
  assert.match(getCssBlock(css, ".pet-sprite-failed"), /--sprite-row:\s*5;/, "row 5 = failed");
  assert.match(getCssBlock(css, ".pet-sprite-waiting"), /--sprite-row:\s*6;/, "row 6 = waiting");
  assert.match(getCssBlock(css, ".pet-sprite-running"), /--sprite-row:\s*7;/, "row 7 = running");
  assert.match(getCssBlock(css, ".pet-sprite-review"), /--sprite-row:\s*8;/, "row 8 = review");
  assert.match(getCssBlock(css, ".pet-run-up .pet-sprite"), /--sprite-row:\s*4;/, "upward drag uses jumping row");
  assert.match(getCssBlock(css, ".pet-run-down .pet-sprite"), /--sprite-row:\s*7;/, "downward drag uses running row");
  assert.doesNotMatch(getCssBlock(css, ".pet-sprite"), /rotate\(/, "sprite rendering should stay at native orientation");
});

test("pending card state does not leave the pet permanently jumping", async () => {
  const { petUiState, cleanupBundle } = await buildPetUiStateModule();

  assert.equal(
    petUiState.getPetUiState({
      activeCardTitle: "新的小卡片",
      isExpanded: false,
      petHourlyBudget: 3,
      petMode: "focus",
      petShownThisHour: 1,
    }),
    "carrying"
  );
  assert.equal(petUiState.petExpressionByState.carrying, "waving");

  await cleanupBundle();
});

test("mini Boba is smaller than the source sprite while keeping Petdex rows intact", async () => {
  const css = await fs.readFile(rendererStyles, "utf8");

  assert.match(css, /--mini-pet-scale:\s*0\.75;/, "expected mini Boba to render at 75% scale");
  assert.match(css, /--mini-pet-width:\s*144px;/, "expected mini Boba width to be smaller than the 192px source frame");
  assert.match(css, /--mini-pet-height:\s*156px;/, "expected mini Boba height to be smaller than the 208px source frame");
  assert.match(getCssBlock(css, ".pet-avatar-button-mini"), /width:\s*var\(--mini-pet-width\);/, "expected mini hit target to match the smaller visual width");
  assert.match(getCssBlock(css, ".pet-sprite-mini"), /--pet-scale:\s*var\(--mini-pet-scale\);/, "expected mini sprite to use the smaller scale");
});

test("mini click bubble renders above the Boba sprite", async () => {
  const css = await fs.readFile(rendererStyles, "utf8");

  assert.match(getCssBlock(css, ".pet-shell-mini"), /isolation:\s*isolate;/, "expected mini pet to own its stacking context");
  assert.match(getCssBlock(css, ".pet-avatar-shell-mini"), /z-index:\s*1;/, "expected Boba sprite to sit below mini overlays");
  assert.match(getCssBlock(css, ".pet-click-bubble"), /z-index:\s*3;/, "expected click bubble to render above the sprite");
});

test("mini click bubble and Boba use separate horizontal slots", async () => {
  const css = await fs.readFile(rendererStyles, "utf8");

  assert.match(getCssBlock(css, ".app-shell-mini-bubble .pet-stage"), /align-items:\s*stretch;/, "expected bubble mode to use the full widened mini window");
  assert.match(getCssBlock(css, ".app-shell-mini-bubble .pet-avatar-shell-mini"), /justify-items:\s*end;/, "expected Boba to move to the right side while the bubble is visible");
  assert.match(getCssBlock(css, ".pet-click-bubble"), /left:\s*8px;/, "expected the bubble to stay in the left slot");
  assert.match(getCssBlock(css, ".pet-click-bubble"), /max-width:\s*92px;/, "expected the bubble to fit before Boba's right-side slot");
});

test("expanded nest stays a single-layer function panel", async () => {
  const { App, cleanupBundle } = await buildAppModule();
  const { cleanup } = setupDom();
  const container = document.getElementById("root");
  assert.ok(container);

  const root = ReactDOMClient.createRoot(container);

  await act(async () => {
    root.render(React.createElement(App));
  });

  await openNestWithContextMenu(container);

  assert.ok(container.querySelector(".pet-workbench"), "expected workbench in expanded nest");
  assert.equal(container.querySelector(".bubble-panel"), null, "expected expanded nest not to show a speech bubble");
  assert.equal(container.querySelector(".pet-titlebar"), null, "expected expanded nest not to show a separate titlebar");
  await act(async () => {
    root.unmount();
  });

  cleanup();
  await cleanupBundle();
});

test("workbench panel keeps a visible border and shadow on light backgrounds", async () => {
  const css = await fs.readFile(rendererStyles, "utf8");
  const workbenchBlock = Array.from(css.matchAll(/\.pet-workbench\s*\{[^}]*\}/g)).at(-1)?.[0] ?? "";

  assert.match(css, /\.app-shell-expanded\s*\{[^}]*background:\s*transparent;/, "expected expanded window background to stay transparent");
  assert.doesNotMatch(workbenchBlock, /radial-gradient|linear-gradient/, "expected workbench panel to avoid layered gradient backgrounds");
  assert.match(workbenchBlock, /border:\s*1px solid var\(--line-strong\)/, "expected workbench to use a strong border so it stays visible on light desktops");
  assert.match(workbenchBlock, /box-shadow:\s*var\(--shadow-panel\)/, "expected workbench to keep the panel shadow token for depth");
});

test("compact mode renders a full resume thread card with next-step body", async () => {
  const { App, cleanupBundle } = await buildAppModule();
  const { cleanup } = setupDom();
  const container = document.getElementById("root");
  assert.ok(container);

  const root = ReactDOMClient.createRoot(container);

  await act(async () => {
    root.render(React.createElement(App));
    await new Promise((resolve) => setTimeout(resolve, 0));
  });

  const miniResumeButton = container.querySelector(".pet-mini-resume-thread");
  assert.ok(miniResumeButton, "expected the mini-mode resume entry once a remembered thread is seeded");

  await act(async () => {
    miniResumeButton.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await new Promise((resolve) => setTimeout(resolve, 0));
  });

  // After resume, App sets activeCard, so the bubble takes over and ResumeThreadCard hides.
  // Close the bubble to prove the resume card returns when no active bubble is on screen.
  const bubbleHide = container.querySelector(".bubble-panel .ghost-button");
  assert.ok(bubbleHide, "expected the active bubble to render after the resume click");

  await act(async () => {
    bubbleHide.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });

  const resumeCard = container.querySelector(".pet-resume-card");
  assert.ok(resumeCard, "expected the full resume thread card once the active bubble is dismissed");
  const resumeTitle = resumeCard.querySelector(".pet-resume-card-title");
  assert.ok(resumeTitle, "expected the resume card to render the thread title");
  assert.equal(resumeTitle.textContent, sampleCard.title);
  assert.ok(resumeCard.querySelector(".pet-resume-card-row"), "expected the resume card to render at least the next-step row");
  assert.ok(resumeCard.querySelector(".pet-resume-card-primary"), "expected a primary resume action");
  assert.ok(resumeCard.querySelector(".pet-resume-card-secondary"), "expected a secondary collapse action");

  // Memory hint inside PetPresence should yield to the full card so the same thread is not echoed twice.
  const presenceMemoryButton = container.querySelector(".pet-presence-card[data-memory-active=\"true\"], .pet-presence-card .pet-presence-memory");
  assert.equal(presenceMemoryButton, null, "expected the presence memory hint to step aside while the resume card is on screen");

  // Collapsing the resume card should remove it for this thread id.
  const collapseButton = resumeCard.querySelector(".pet-resume-card-secondary");

  await act(async () => {
    collapseButton.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });

  assert.equal(container.querySelector(".pet-resume-card"), null, "expected the resume card to disappear after collapse");

  await act(async () => {
    root.unmount();
  });

  cleanup();
  await cleanupBundle();
});

test("workbench collapse button takes the user straight back to mini", async () => {
  const { App, cleanupBundle } = await buildAppModule();
  const { cleanup, setWindowSizeCalls } = setupDom();
  const container = document.getElementById("root");
  assert.ok(container);

  const root = ReactDOMClient.createRoot(container);

  await act(async () => {
    root.render(React.createElement(App));
  });

  await openNestWithContextMenu(container);
  setWindowSizeCalls.length = 0;
  await collapseNest(container);

  assert.deepEqual(setWindowSizeCalls, ["mini"], "workbench collapse should jump straight back to mini");

  await act(async () => {
    root.unmount();
  });

  cleanup();
  await cleanupBundle();
});
