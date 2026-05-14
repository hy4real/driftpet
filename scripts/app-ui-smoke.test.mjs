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
const sampleVaultDir = "/tmp/driftpet-vault";
const sampleRepoDir = "/tmp/driftpet-repo";

const sampleCard = {
  id: 17,
  itemId: 9,
  title: "Ship product work instead of polishing infra",
  useFor: "Return to the core desk pet loop and stop widening the shell.",
  knowledgeTag: "thread reset",
  summaryForRetrieval: "ship product work stop polishing infra",
  threadCache: {
    chasing: "Ship product work instead of polishing infra",
    workingJudgment: "The product loop matters more than infrastructure polish right now.",
    ruledOut: "Do not widen the shell before the desk pet loop is stable.",
    nextMove: "Return to the core desk pet loop and stop widening the shell.",
    sideThread: "Keep infrastructure polish as a deferred branch.",
    expiresWhen: "when the product loop is shipped",
  },
  related: [
    {
      cardId: 18,
      title: "Trim portability cleanup into one follow-up",
      reason: "same work thread",
    },
  ],
  petRemark: "This is the active thread.",
  createdAt: Date.now(),
};

const sampleThreadCard = {
  id: 18,
  itemId: 10,
  title: "Trim portability cleanup into one follow-up",
  useFor: "Keep the portability cleanup narrow and get back to feature work.",
  knowledgeTag: "thread reset",
  summaryForRetrieval: "trim portability cleanup and get back to feature work",
  threadCache: null,
  related: [],
  petRemark: "Still part of the same line.",
  createdAt: sampleCard.createdAt - 1000,
};

const sampleBacklinkCard = {
  id: 19,
  itemId: 11,
  title: "Thread the next feature through the existing workbench",
  useFor: "Show continuity in the UI before inventing new storage.",
  knowledgeTag: "thread mode",
  summaryForRetrieval: "show continuity in the ui before inventing new storage",
  threadCache: null,
  related: [
    {
      cardId: sampleCard.id,
      title: sampleCard.title,
      reason: "depends on the anchor card",
    },
  ],
  petRemark: "This one loops back to the anchor.",
  createdAt: sampleCard.createdAt - 2000,
};

const sampleHistory = [sampleCard, sampleThreadCard, sampleBacklinkCard];

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
    lastProcessedResult: {
      updateId: 232043301,
      tgMessageId: "5100853111:13",
      source: "tg_url",
      rawUrl: "https://b23.tv/Cmz4QJI",
      artifactPath: `${sampleVaultDir}/AI/Bilibili/【闪客】大模型已死？上帝视角拆解三年 LLM 架构演进！.md`,
      created: true,
      cardId: 40,
      cardTitle: "【闪客】大模型已死？上帝视角拆解三年 LLM 架构演进！",
      processor: "video-to-note",
      extractionStage: "note_ingested",
      itemStatus: "digested",
      textPreview: "【【闪客】大模型已死？上帝视角拆解三年 LLM 架构演进！-哔哩哔哩】 https://b23.tv/Cmz4QJI",
      captionPreview: null,
      entityTypes: ["url"],
      note: "created_or_updated_card",
      updatedAt: Date.now(),
    },
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
        threadCache: sampleCard.threadCache,
        related: sampleCard.related,
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

const buildStatusPanelModule = async () => {
  await fs.mkdir(localTempRoot, { recursive: true });
  const tempDir = await fs.mkdtemp(path.join(localTempRoot, "driftpet-status-panel-"));
  const outfile = path.join(tempDir, "StatusPanel.cjs");

  await build({
    entryPoints: [path.resolve("src/renderer/components/StatusPanel.tsx")],
    bundle: true,
    format: "cjs",
    platform: "node",
    outfile,
    jsx: "automatic",
    loader: {
      ".tsx": "tsx",
    },
    external: ["react", "react/jsx-runtime", "react/jsx-dev-runtime"],
  });

  const moduleExports = require(outfile);
  return {
    StatusPanel: moduleExports.StatusPanel ?? moduleExports.default ?? moduleExports,
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
  const dispatchClaudeThreadCalls = [];
  const updateClaudeDispatchStatusCalls = [];
  const captureClaudeDispatchResultCalls = [];
  const deleteCardCalls = [];
  const releaseRememberedThreadCalls = [];
  const claudeDispatchSettingWrites = [];
  let latestClaudeDispatch = null;
  let releasedRememberedThreadCardId = null;
  let claudeDispatchSettings = {
    terminalApp: "Ghostty",
    workingDirectory: sampleRepoDir,
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
    listRecentCards: async () => sampleHistory.map((card) => ({
      ...card,
      latestClaudeDispatch,
    })),
    deleteCard: async (cardId) => {
      deleteCardCalls.push(cardId);
      return true;
    },
    releaseRememberedThread: async (cardId) => {
      releaseRememberedThreadCalls.push(cardId);
      releasedRememberedThreadCardId = cardId;
    },
    getStatus: async () => ({
      ...sampleStatus,
      pet: {
        ...sampleStatus.pet,
        rememberedThread: sampleStatus.pet.rememberedThread?.cardId === releasedRememberedThreadCardId
          ? null
          : sampleStatus.pet.rememberedThread,
      },
    }),
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
        mode: "card",
      };
      return latestClaudeDispatch;
    },
    dispatchClaudeThread: async (cardId) => {
      dispatchClaudeThreadCalls.push(cardId);
      latestClaudeDispatch = {
        command: `claude mock-thread-dispatch ${cardId}`,
        promptPath: `/tmp/thread-${cardId}.md`,
        runner: "claude-test",
        cwd: "/tmp/driftpet-worktree",
        createdAt: Date.now(),
        status: "launched",
        mode: "thread",
      };
      return latestClaudeDispatch;
    },
    updateClaudeDispatchStatus: async (cardId, status) => {
      updateClaudeDispatchStatusCalls.push([cardId, status]);
      if (latestClaudeDispatch === null) {
        throw new Error(`Claude dispatch not found: ${cardId}`);
      }
      latestClaudeDispatch = {
        ...latestClaudeDispatch,
        status,
      };
      return latestClaudeDispatch;
    },
    captureClaudeDispatchResult: async (cardId, resultSummary) => {
      captureClaudeDispatchResultCalls.push([cardId, resultSummary]);
      if (latestClaudeDispatch === null) {
        throw new Error(`Claude dispatch not found: ${cardId}`);
      }
      latestClaudeDispatch = {
        ...latestClaudeDispatch,
        status: "done",
        resultSummary: resultSummary.trim(),
        resultCapturedAt: Date.now(),
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
    onPetdexRuntimeState: () => () => {},
    onPetdexBubble: () => () => {},
  };

  return {
    dom,
    setWindowSizeCalls,
    setMiniBubbleVisibleCalls,
    moveWindowByCalls,
    dispatchClaudeCodeCalls,
    dispatchClaudeThreadCalls,
    updateClaudeDispatchStatusCalls,
    captureClaudeDispatchResultCalls,
    deleteCardCalls,
    releaseRememberedThreadCalls,
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

const setFormControlValue = async (control, value) => {
  await act(async () => {
    const descriptor = Object.getOwnPropertyDescriptor(
      control instanceof window.HTMLTextAreaElement
        ? window.HTMLTextAreaElement.prototype
        : window.HTMLInputElement.prototype,
      "value"
    );
    assert.ok(descriptor?.set, "expected form control value setter");
    descriptor.set.call(control, value);
    control.dispatchEvent(new window.InputEvent("input", {
      bubbles: true,
      data: value,
      inputType: "insertText",
    }));
    control.dispatchEvent(new Event("change", { bubbles: true }));
    await Promise.resolve();
    await Promise.resolve();
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
  const miniResume = container.querySelector(".pet-mini-resume-thread");
  assert.ok(miniResume, "mini mode may show the remembered-thread resume entry");
  assert.match(miniResume.textContent ?? "", /正在追/);
  assert.match(miniResume.textContent ?? "", /下一手/);
  assert.match(miniResume.textContent ?? "", /Ship product work/);
  assert.match(miniResume.textContent ?? "", /Return to the cor/);

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
  assert.match(resumeThread.textContent ?? "", /正在追/);
  assert.match(resumeThread.textContent ?? "", /下一手/);
  assert.match(resumeThread.textContent ?? "", /Ship product work/);
  assert.match(resumeThread.textContent ?? "", /Return to the cor/);

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

test("mini remembered thread marks stale lines as cold", async () => {
  const savedRememberedThread = sampleStatus.pet.rememberedThread;
  const savedCreatedAt = sampleCard.createdAt;
  sampleCard.createdAt = Date.now() - 25 * 60 * 60 * 1000;
  sampleStatus.pet.rememberedThread = {
    cardId: sampleCard.id,
    title: sampleCard.title,
    createdAt: sampleCard.createdAt,
  };

  try {
    const { App, cleanupBundle } = await buildAppModule();
    const { cleanup } = setupDom();
    const container = document.getElementById("root");
    assert.ok(container);

    const root = ReactDOMClient.createRoot(container);

    await act(async () => {
      root.render(React.createElement(App));
      await Promise.resolve();
      await Promise.resolve();
    });

    const resumeThread = container.querySelector(".pet-mini-resume-thread");
    assert.ok(resumeThread, "expected mini mode to expose the stale remembered thread");
    assert.match(resumeThread.textContent ?? "", /可放下/);
    assert.match(resumeThread.textContent ?? "", /冷掉条件/);
    assert.match(resumeThread.textContent ?? "", /when the product/);

    await act(async () => {
      root.unmount();
    });

    cleanup();
    await cleanupBundle();
  } finally {
    sampleCard.createdAt = savedCreatedAt;
    sampleStatus.pet.rememberedThread = savedRememberedThread;
  }
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

  const logToggle = Array.from(container.querySelectorAll("button")).find((button) => button.textContent?.includes("放下的线"));
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

  const logToggle = Array.from(container.querySelectorAll("button")).find((button) => button.textContent?.includes("放下的线"));
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
  assert.match(container.textContent ?? "", /单卡已派发/, "expected latest dispatch state to stay visible on the card");

  await act(async () => {
    root.unmount();
  });

  cleanup();
  await cleanupBundle();
});

test("history drawer can mark a launched Claude dispatch done", async () => {
  const { App, cleanupBundle } = await buildAppModule();
  const { cleanup, dispatchClaudeCodeCalls, updateClaudeDispatchStatusCalls, setWindowSizeCalls } = setupDom();
  const container = document.getElementById("root");
  assert.ok(container);

  const root = ReactDOMClient.createRoot(container);

  await act(async () => {
    root.render(React.createElement(App));
  });

  await openNestWithContextMenu(container);
  assert.deepEqual(setWindowSizeCalls, ["expanded"]);

  const logToggle = Array.from(container.querySelectorAll("button")).find((button) => button.textContent?.includes("放下的线"));
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
  assert.match(container.textContent ?? "", /单卡已派发/);

  const markDoneButton = Array.from(container.querySelectorAll("button")).find((button) => button.textContent?.includes("标记完成"));
  assert.ok(markDoneButton, "expected mark-done action for launched dispatch");

  await act(async () => {
    markDoneButton.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await Promise.resolve();
    await Promise.resolve();
  });

  assert.deepEqual(updateClaudeDispatchStatusCalls, [[sampleCard.id, "done"]], "expected status update to mark the selected card done");
  assert.match(container.textContent ?? "", /单卡已完成/, "expected done dispatch state to stay visible");
  assert.doesNotMatch(container.textContent ?? "", /收起记录/, "done dispatch should no longer show close-loop actions");

  await act(async () => {
    root.unmount();
  });

  cleanup();
  await cleanupBundle();
});

test("history drawer can capture a Claude dispatch result summary", async () => {
  const { App, cleanupBundle } = await buildAppModule();
  const { cleanup, dispatchClaudeCodeCalls, captureClaudeDispatchResultCalls, setWindowSizeCalls } = setupDom();
  const container = document.getElementById("root");
  assert.ok(container);

  const root = ReactDOMClient.createRoot(container);

  await act(async () => {
    root.render(React.createElement(App));
  });

  await openNestWithContextMenu(container);
  assert.deepEqual(setWindowSizeCalls, ["expanded"]);

  const logToggle = Array.from(container.querySelectorAll("button")).find((button) => button.textContent?.includes("放下的线"));
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

  const historyDrawer = container.querySelector(".history-drawer.open");
  assert.ok(historyDrawer, "expected open history drawer");

  const recordResultButton = Array.from(historyDrawer.querySelectorAll("button")).find((button) => button.textContent?.includes("记录结果"));
  assert.ok(recordResultButton, "expected record-result action for launched dispatch");

  await act(async () => {
    recordResultButton.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });

  const resultInput = historyDrawer.querySelector(".history-card-dispatch-result-input");
  assert.ok(resultInput, "expected result summary textarea");

  await setFormControlValue(resultInput, "Changed the dispatch close-loop and verified smoke tests.");

  const saveResultButton = Array.from(historyDrawer.querySelectorAll("button")).find((button) => button.textContent?.includes("保存结果"));
  assert.ok(saveResultButton, "expected save-result action");

  await act(async () => {
    saveResultButton.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await Promise.resolve();
    await Promise.resolve();
  });

  assert.deepEqual(captureClaudeDispatchResultCalls, [
    [sampleCard.id, "Changed the dispatch close-loop and verified smoke tests."],
  ], "expected result capture to receive the summary");
  assert.match(container.textContent ?? "", /单卡已完成/, "capturing a result should mark the dispatch done");
  assert.match(container.textContent ?? "", /Changed the dispatch close-loop and verified smoke tests\./, "expected captured result to stay visible");
  assert.match(container.textContent ?? "", /Claude 结果已记回这条线。/, "expected capture feedback");

  await act(async () => {
    root.unmount();
  });

  cleanup();
  await cleanupBundle();
});

test("workbench shows the active thread bundle in continuous mode", async () => {
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

  const threadPanel = container.querySelector(".pet-workbench-thread-panel");
  assert.ok(threadPanel, "expected an active thread panel in the workbench");
  assert.match(threadPanel.textContent ?? "", /守线模式/);
  assert.match(threadPanel.textContent ?? "", /Ship product work instead of polishing infra/);
  assert.match(threadPanel.textContent ?? "", /Trim portability cleanup into one follow-up/);

  await act(async () => {
    root.unmount();
  });

  cleanup();
  await cleanupBundle();
});

test("workbench can dispatch the whole active thread to Claude Code", async () => {
  const { App, cleanupBundle } = await buildAppModule();
  const { cleanup, dispatchClaudeThreadCalls, dispatchClaudeCodeCalls, setWindowSizeCalls } = setupDom();
  const container = document.getElementById("root");
  assert.ok(container);

  const root = ReactDOMClient.createRoot(container);

  await act(async () => {
    root.render(React.createElement(App));
  });

  await openNestWithContextMenu(container);
  assert.deepEqual(setWindowSizeCalls, ["expanded"]);

  const dispatchThreadButton = Array.from(container.querySelectorAll("button")).find((button) =>
    button.textContent?.includes("派给 Claude Code（整条线）")
  );
  assert.ok(dispatchThreadButton, "expected thread dispatch button");

  await act(async () => {
    dispatchThreadButton.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await Promise.resolve();
    await Promise.resolve();
  });

  assert.deepEqual(dispatchClaudeThreadCalls, [sampleCard.id], "expected whole-thread dispatch to use the anchor card id");
  assert.deepEqual(dispatchClaudeCodeCalls, [], "thread dispatch must not fall back to single-card dispatch");
  assert.match(container.textContent ?? "", /整条线已派给 Claude Code：claude-test/);
  assert.match(container.textContent ?? "", /整条线已派发/);

  await act(async () => {
    root.unmount();
  });

  cleanup();
  await cleanupBundle();
});

test("workbench can dismiss the visible whole-thread dispatch record", async () => {
  const { App, cleanupBundle } = await buildAppModule();
  const { cleanup, dispatchClaudeThreadCalls, updateClaudeDispatchStatusCalls, setWindowSizeCalls } = setupDom();
  const container = document.getElementById("root");
  assert.ok(container);

  const root = ReactDOMClient.createRoot(container);

  await act(async () => {
    root.render(React.createElement(App));
  });

  await openNestWithContextMenu(container);
  assert.deepEqual(setWindowSizeCalls, ["expanded"]);

  const dispatchThreadButton = Array.from(container.querySelectorAll("button")).find((button) =>
    button.textContent?.includes("派给 Claude Code（整条线）")
  );
  assert.ok(dispatchThreadButton, "expected thread dispatch button");

  await act(async () => {
    dispatchThreadButton.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await Promise.resolve();
    await Promise.resolve();
  });

  assert.deepEqual(dispatchClaudeThreadCalls, [sampleCard.id], "expected whole-thread dispatch to use the anchor card id");
  assert.match(container.textContent ?? "", /整条线已派发/);

  const dismissButton = Array.from(container.querySelectorAll("button")).find((button) => button.textContent?.includes("收起记录"));
  assert.ok(dismissButton, "expected dismiss action for launched thread dispatch");

  await act(async () => {
    dismissButton.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await Promise.resolve();
    await Promise.resolve();
  });

  assert.deepEqual(updateClaudeDispatchStatusCalls, [[sampleCard.id, "dismissed"]], "expected status update to dismiss the selected thread dispatch");
  assert.doesNotMatch(container.textContent ?? "", /整条线已派发/, "dismissed dispatch should not keep the thread status note visible");
  assert.match(container.textContent ?? "", /Claude 派发记录已收起。/, "expected transient feedback after dismissing");

  await act(async () => {
    root.unmount();
  });

  cleanup();
  await cleanupBundle();
});

test("workbench can capture a whole-thread Claude result summary", async () => {
  const { App, cleanupBundle } = await buildAppModule();
  const { cleanup, dispatchClaudeThreadCalls, captureClaudeDispatchResultCalls, setWindowSizeCalls } = setupDom();
  const container = document.getElementById("root");
  assert.ok(container);

  const root = ReactDOMClient.createRoot(container);

  await act(async () => {
    root.render(React.createElement(App));
  });

  await openNestWithContextMenu(container);
  assert.deepEqual(setWindowSizeCalls, ["expanded"]);

  const dispatchThreadButton = Array.from(container.querySelectorAll("button")).find((button) =>
    button.textContent?.includes("派给 Claude Code（整条线）")
  );
  assert.ok(dispatchThreadButton, "expected thread dispatch button");

  await act(async () => {
    dispatchThreadButton.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await Promise.resolve();
    await Promise.resolve();
  });

  assert.deepEqual(dispatchClaudeThreadCalls, [sampleCard.id], "expected whole-thread dispatch to use the anchor card id");

  const threadPanel = container.querySelector(".pet-workbench-thread-panel");
  assert.ok(threadPanel, "expected active thread panel");

  const recordResultButton = Array.from(threadPanel.querySelectorAll("button")).find((button) => button.textContent?.includes("记录结果"));
  assert.ok(recordResultButton, "expected record-result action for launched thread dispatch");

  await act(async () => {
    recordResultButton.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });

  const resultInput = threadPanel.querySelector(".pet-workbench-thread-result-input");
  assert.ok(resultInput, "expected thread result summary textarea");

  await setFormControlValue(resultInput, "Thread dispatch landed the UI state and docs.");

  const saveResultButton = Array.from(threadPanel.querySelectorAll("button")).find((button) => button.textContent?.includes("保存结果"));
  assert.ok(saveResultButton, "expected save-result action");

  await act(async () => {
    saveResultButton.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await Promise.resolve();
    await Promise.resolve();
  });

  assert.deepEqual(captureClaudeDispatchResultCalls, [
    [sampleCard.id, "Thread dispatch landed the UI state and docs."],
  ], "expected thread result capture to receive the summary");
  assert.match(container.textContent ?? "", /整条线已完成/, "capturing a thread result should mark the dispatch done");
  assert.match(container.textContent ?? "", /Thread dispatch landed the UI state and docs\./, "expected captured thread result to stay visible");

  await act(async () => {
    root.unmount();
  });

  cleanup();
  await cleanupBundle();
});

test("status panel shows the latest Telegram processing result", async () => {
  const { StatusPanel, cleanupBundle } = await buildStatusPanelModule();
  const { cleanup } = setupDom();
  const container = document.getElementById("root");
  assert.ok(container);

  const root = ReactDOMClient.createRoot(container);

  await act(async () => {
    root.render(React.createElement(StatusPanel, {
      isOpen: true,
      status: sampleStatus,
      onClose: () => {},
      onRefresh: () => {},
    }));
  });

  const detailsButton = Array.from(container.querySelectorAll("button")).find((button) => button.textContent?.includes("看看详细状态"));
  assert.ok(detailsButton, "expected details toggle");

  await act(async () => {
    detailsButton.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });

  assert.match(container.textContent ?? "", /last update · 232043301/);
  assert.match(container.textContent ?? "", /【闪客】大模型已死？上帝视角拆解三年 LLM 架构演进！/);
  assert.match(container.textContent ?? "", /https:\/\/b23\.tv\/Cmz4QJI/);
  assert.match(container.textContent ?? "", /result · 已生成或更新卡片/);
  assert.match(container.textContent ?? "", /AI\/Bilibili/);

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

  const logToggle = Array.from(container.querySelectorAll("button")).find((button) => button.textContent?.includes("放下的线"));
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
  assert.doesNotMatch(
    container.textContent ?? "",
    /Ship product work instead of polishing infra/,
    "expected the deleted card title to disappear from history"
  );

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
    workingDirectory: sampleRepoDir,
  });
  assert.deepEqual(claudeDispatchSettingWrites[1], {
    continuityMode: "isolated",
    terminalApp: "Terminal",
    workingDirectory: sampleRepoDir,
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

  const submitButton = Array.from(container.querySelectorAll("button")).find((button) => button.textContent?.includes("交给它守"));
  assert.ok(submitButton, "expected submit button");

  await act(async () => {
    submitButton.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await Promise.resolve();
  });

  assert.equal(container.querySelector(".bubble-panel"), null, "expected expanded workbench to stay a single function surface after saving");
  assert.match(container.textContent ?? "", /交给它守|正在守住/);

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
  const { cleanup, releaseRememberedThreadCalls } = setupDom();
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
  assert.match(resumeCard.textContent ?? "", /正在追/);
  assert.match(resumeCard.textContent ?? "", /临时判断/);
  assert.match(resumeCard.textContent ?? "", /别再走/);
  assert.match(resumeCard.textContent ?? "", /Do not widen the shell/);
  assert.ok(resumeCard.querySelector(".pet-resume-card-primary"), "expected a primary resume action");
  assert.ok(resumeCard.querySelector(".pet-resume-card-secondary"), "expected a secondary collapse action");

  // Memory hint inside PetPresence should yield to the full card so the same thread is not echoed twice.
  const presenceMemoryButton = container.querySelector(".pet-presence-card[data-memory-active=\"true\"], .pet-presence-card .pet-presence-memory");
  assert.equal(presenceMemoryButton, null, "expected the presence memory hint to step aside while the resume card is on screen");

  // Releasing the resume card should stop guarding it without deleting it.
  const collapseButton = resumeCard.querySelector(".pet-resume-card-secondary");
  assert.match(collapseButton.textContent ?? "", /放下这条/);

  await act(async () => {
    collapseButton.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await new Promise((resolve) => setTimeout(resolve, 0));
  });

  assert.equal(container.querySelector(".pet-resume-card"), null, "expected the resume card to disappear after release");
  assert.equal(container.querySelector(".pet-mini-resume-thread"), null, "released thread should not immediately return as guarded memory");
  assert.deepEqual(releaseRememberedThreadCalls, [sampleCard.id], "release should persist the remembered thread card id");
  assert.match(container.textContent ?? "", /Ship product work instead of polishing infra/, "released card should remain available in history");

  await act(async () => {
    root.unmount();
  });

  cleanup();
  await cleanupBundle();
});

test("expanded workbench shows a resume strip when a remembered thread exists", async () => {
  const { App, cleanupBundle } = await buildAppModule();
  const { cleanup, setWindowSizeCalls } = setupDom();
  const container = document.getElementById("root");
  assert.ok(container);

  const root = ReactDOMClient.createRoot(container);

  await act(async () => {
    root.render(React.createElement(App));
    await new Promise((resolve) => setTimeout(resolve, 0));
  });

  await openNestWithContextMenu(container);
  assert.deepEqual(setWindowSizeCalls, ["expanded"]);

  const resumeStrip = container.querySelector(".pet-workbench-resume-strip");
  assert.ok(resumeStrip, "expected the resume strip to render at the top of the expanded workbench");
  assert.match(resumeStrip.textContent ?? "", /正在守着的线/);
  assert.match(resumeStrip.textContent ?? "", /Ship product work instead of polishing infra/);

  const continueButton = resumeStrip.querySelector(".pet-workbench-resume-strip-button");
  assert.ok(continueButton, "expected a continue button in the resume strip");
  assert.match(continueButton.textContent ?? "", /接回/);

  await act(async () => {
    continueButton.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await new Promise((resolve) => setTimeout(resolve, 0));
  });

  assert.deepEqual(setWindowSizeCalls, ["expanded", "compact"], "resume from expanded strip should switch to compact mode to show the card");

  await act(async () => {
    root.unmount();
  });

  cleanup();
  await cleanupBundle();
});

test("expanded workbench earlier-cards fold toggles and selects a card", async () => {
  const { App, cleanupBundle } = await buildAppModule();
  const { cleanup, setWindowSizeCalls } = setupDom();
  const container = document.getElementById("root");
  assert.ok(container);

  const root = ReactDOMClient.createRoot(container);

  await act(async () => {
    root.render(React.createElement(App));
    await new Promise((resolve) => setTimeout(resolve, 0));
  });

  await openNestWithContextMenu(container);
  assert.deepEqual(setWindowSizeCalls, ["expanded"]);

  const toggle = container.querySelector(".pet-workbench-history-toggle");
  assert.ok(toggle, "expected the earlier-cards toggle button");
  assert.match(toggle.textContent ?? "", /放下的线/);
  assert.equal(container.querySelector(".pet-workbench-history-list"), null, "fold should be collapsed by default");

  await act(async () => {
    toggle.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });

  assert.match(toggle.textContent ?? "", /收起放下的线/);
  const historyList = container.querySelector(".pet-workbench-history-list");
  assert.ok(historyList, "fold should expand to show the card list");

  const items = historyList.querySelectorAll(".pet-workbench-history-item");
  assert.ok(items.length > 0, "expected at least one history item");

  await act(async () => {
    items[0].dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });

  assert.match(container.textContent ?? "", /Ship product work instead of polishing infra/, "selecting a recent card should reveal it on screen");

  await act(async () => {
    root.unmount();
  });

  cleanup();
  await cleanupBundle();
});

test("compact PetControls has no history button after G3 demotion", async () => {
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
  assert.ok(miniResumeButton);

  await act(async () => {
    miniResumeButton.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await new Promise((resolve) => setTimeout(resolve, 0));
  });

  const compactButtons = Array.from(container.querySelectorAll(".pet-chip-row button"));
  const buttonTexts = compactButtons.map((button) => button.textContent?.trim());
  assert.equal(buttonTexts.includes("记忆"), false, "compact PetControls must not expose a history button after G3 demotion");
  assert.ok(buttonTexts.includes("戳我"), "poke button should remain");
  assert.ok(buttonTexts.includes("收起"), "minimize button should remain");

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

// --- G4: end-to-end remembered-thread validation ---

test("G4: isolated continuity mode hides remembered thread across all window modes", async () => {
  const saved = sampleStatus.pet.rememberedThread;
  sampleStatus.pet.rememberedThread = null;

  try {
    const { App, cleanupBundle } = await buildAppModule();
    const { cleanup, setWindowSizeCalls } = setupDom();
    const container = document.getElementById("root");
    assert.ok(container);

    const root = ReactDOMClient.createRoot(container);

    await act(async () => {
      root.render(React.createElement(App));
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    // Mini mode: no resume thread entry when rememberedThread is null.
    assert.equal(
      container.querySelector(".pet-mini-resume-thread"),
      null,
      "isolated mode must not show the mini resume thread entry"
    );

    // Open the nest — resume strip must also be absent.
    await openNestWithContextMenu(container);
    assert.deepEqual(setWindowSizeCalls, ["expanded"]);

    assert.equal(
      container.querySelector(".pet-workbench-resume-strip"),
      null,
      "isolated mode must not show the expanded resume strip"
    );

    // Earlier-cards fold should still work independently of remembered thread.
    const toggle = container.querySelector(".pet-workbench-history-toggle");
    assert.ok(toggle, "earlier-cards toggle should still be present in isolated mode");

    await act(async () => {
      root.unmount();
    });

    cleanup();
    await cleanupBundle();
  } finally {
    sampleStatus.pet.rememberedThread = saved;
  }
});

test("G4: remembered thread card can be dispatched to Claude Code from the history drawer", async () => {
  const { App, cleanupBundle } = await buildAppModule();
  const { cleanup, dispatchClaudeCodeCalls, setWindowSizeCalls } = setupDom();
  const container = document.getElementById("root");
  assert.ok(container);

  const root = ReactDOMClient.createRoot(container);

  await act(async () => {
    root.render(React.createElement(App));
    await new Promise((resolve) => setTimeout(resolve, 0));
  });

  // Open the expanded nest and the earlier-cards fold.
  await openNestWithContextMenu(container);
  assert.deepEqual(setWindowSizeCalls, ["expanded"]);

  const toggle = container.querySelector(".pet-workbench-history-toggle");
  assert.ok(toggle);
  await act(async () => {
    toggle.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });

  // Click a history item to select it.
  const items = container.querySelectorAll(".pet-workbench-history-item");
  assert.ok(items.length > 0, "expected at least one history item");
  await act(async () => {
    items[0].dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await new Promise((resolve) => setTimeout(resolve, 0));
  });

  // The selected card should be the remembered thread card.
  const cardId = sampleStatus.pet.rememberedThread?.cardId;
  assert.ok(cardId !== undefined, "remembered thread must have a cardId");

  // Find and click the dispatch button for this card.
  const dispatchButton = Array.from(container.querySelectorAll("button")).find(
    (button) => button.textContent?.includes("派给 Claude Code")
  );
  assert.ok(dispatchButton, "expected Claude Code dispatch button for the selected card");

  await act(async () => {
    dispatchButton.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await new Promise((resolve) => setTimeout(resolve, 0));
  });

  assert.deepEqual(
    dispatchClaudeCodeCalls,
    [cardId],
    "dispatch should target the remembered thread card id"
  );

  await act(async () => {
    root.unmount();
  });

  cleanup();
  await cleanupBundle();
});

test("G4: remembered thread status structure is valid", () => {
  const thread = sampleStatus.pet.rememberedThread;
  assert.ok(thread !== null, "rememberedThread must be populated in sample status");
  assert.equal(typeof thread.cardId, "number", "rememberedThread.cardId must be a number");
  assert.equal(typeof thread.title, "string", "rememberedThread.title must be a string");
  assert.ok(thread.title.length > 0, "rememberedThread.title must be non-empty");
  assert.equal(typeof thread.createdAt, "number", "rememberedThread.createdAt must be a number");
});
