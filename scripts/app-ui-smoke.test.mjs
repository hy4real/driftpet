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
    meanwhile: null,
    waitingOn: null,
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

const deepClone = (value) => JSON.parse(JSON.stringify(value));

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
  const localHistory = deepClone(sampleHistory);
  const localStatus = deepClone(sampleStatus);
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
  const updateWorklineLifecycleCalls = [];
  const claudeDispatchSettingWrites = [];
  let latestClaudeDispatch = null;
  let releasedRememberedThreadCardId = null;
  let dailyCloseLineCandidates = [];
  let hotCapRejectCardId = null;
  const dailyCloseLineSkips = [];
  let recoverableChaosDraft = null;
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
    listRecentCards: async () => localHistory.map((card) => ({
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
    updateWorklineLifecycle: async (cardId, action) => {
      updateWorklineLifecycleCalls.push([cardId, action]);
      if (hotCapRejectCardId === cardId && action === "continue_guarding") {
        throw new Error("driftpet is already guarding 3 hot worklines.");
      }
      if (action === "drop" || action === "archive") {
        releasedRememberedThreadCardId = cardId;
      }
      const card = localHistory.find((entry) => entry.id === cardId) ?? sampleCard;
      const updatedCard = {
        ...card,
        lifecycleStatus: action === "drop"
          ? "dropped"
          : action === "archive"
            ? "archived"
            : action === "tomorrow"
              ? "waiting"
              : action === "continue_guarding"
                ? "hot"
                : "cooling",
        recoverUntil: action === "drop" ? Date.now() + 7 * 24 * 60 * 60 * 1000 : null,
        lastTouchedAt: Date.now(),
      };
      const index = localHistory.findIndex((entry) => entry.id === cardId);
      if (index >= 0) {
        localHistory[index] = updatedCard;
      }
      return updatedCard;
    },
    listCloseLineCandidates: async () => dailyCloseLineCandidates.map((card) => ({ ...card })),
    skipDailyCloseLine: async (cardIds) => {
      dailyCloseLineSkips.push(cardIds);
      dailyCloseLineCandidates = [];
      return cardIds.length;
    },
    getStatus: async () => ({
      ...localStatus,
      pet: {
        ...localStatus.pet,
        rememberedThread: localStatus.pet.rememberedThread?.cardId === releasedRememberedThreadCardId
          ? null
          : localStatus.pet.rememberedThread,
      },
    }),
    getClaudeDispatchSettings: async () => claudeDispatchSettings,
    setClaudeDispatchSettings: async (settings) => {
      claudeDispatchSettingWrites.push(settings);
      claudeDispatchSettings = settings;
      return claudeDispatchSettings;
    },
    ingestChaosReset: async () => sampleCard,
    getRecoverableChaosDraft: async () => recoverableChaosDraft,
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
      const card = localHistory.find((entry) => entry.id === cardId);
      if (card?.threadCache !== null && card?.threadCache !== undefined) {
        card.threadCache = {
          ...card.threadCache,
          meanwhile: null,
          waitingOn: null,
          waitingResolvedAt: Date.now(),
        };
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
    updateWorklineLifecycleCalls,
    dailyCloseLineSkips,
    setDailyCloseLineCandidates: (cards) => {
      dailyCloseLineCandidates = cards;
    },
    setHotCapRejectCardId: (cardId) => {
      hotCapRejectCardId = cardId;
    },
    claudeDispatchSettingWrites,
    setRecoverableChaosDraft: (draft) => {
      recoverableChaosDraft = draft;
    },
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

test("mini mode surfaces a cooling waiting reminder as a pet note", async () => {
  const savedRememberedThread = sampleStatus.pet.rememberedThread;
  const savedCreatedAt = sampleCard.createdAt;
  const savedThreadCache = sampleCard.threadCache;
  sampleCard.createdAt = Date.now() - 3 * 60 * 60 * 1000;
  sampleStatus.pet.rememberedThread = {
    cardId: sampleCard.id,
    title: sampleCard.title,
    createdAt: sampleCard.createdAt,
  };
  sampleCard.threadCache = {
    ...savedThreadCache,
    nextMove: "先把 B 的验收补完。",
    meanwhile: "先把 B 的验收补完。",
    waitingOn: "A 还在等别人回复",
    sideThread: "A 还在等别人回复，回音没来前先别围着它空转。",
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

    const noteBubble = container.querySelector(".pet-click-bubble");
    assert.ok(noteBubble, "expected the mini pet note bubble for a cooling waiting thread");
    assert.match(noteBubble.textContent ?? "", /等了一阵了/);
    assert.match(noteBubble.textContent ?? "", /先把 B 的验收补完/);

    await act(async () => {
      root.unmount();
    });

    cleanup();
    await cleanupBundle();
  } finally {
    sampleCard.createdAt = savedCreatedAt;
    sampleStatus.pet.rememberedThread = savedRememberedThread;
    sampleCard.threadCache = savedThreadCache;
  }
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

test("mini cold waiting thread shifts from waiting copy to release-oriented copy", async () => {
  const savedRememberedThread = sampleStatus.pet.rememberedThread;
  const savedCreatedAt = sampleCard.createdAt;
  const savedThreadCache = sampleCard.threadCache;
  sampleCard.createdAt = Date.now() - 26 * 60 * 60 * 1000;
  sampleStatus.pet.rememberedThread = {
    cardId: sampleCard.id,
    title: sampleCard.title,
    createdAt: sampleCard.createdAt,
  };
  sampleCard.threadCache = {
    ...savedThreadCache,
    nextMove: "先把 B 的验收补完。",
    meanwhile: "先把 B 的验收补完。",
    waitingOn: "A 还在等别人回复",
    sideThread: "A 还在等别人回复，回音没来前先别围着它空转。",
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

    const noteBubble = container.querySelector(".pet-click-bubble");
    assert.ok(noteBubble);
    assert.match(noteBubble.textContent ?? "", /先放下这条|别再干等了/);

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 4300));
    });

    const resumeThread = container.querySelector(".pet-mini-resume-thread");
    assert.ok(resumeThread);
    assert.match(resumeThread.textContent ?? "", /可放下/);
    assert.match(resumeThread.textContent ?? "", /A 还在等别人回复/);

    await act(async () => {
      root.unmount();
    });

    cleanup();
    await cleanupBundle();
  } finally {
    sampleCard.createdAt = savedCreatedAt;
    sampleStatus.pet.rememberedThread = savedRememberedThread;
    sampleCard.threadCache = savedThreadCache;
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
    await new Promise((resolve) => setTimeout(resolve, 0));
  });

  assert.equal(container.querySelector(".history-drawer.open"), null, "expected selecting a card to close history drawer");
  assert.deepEqual(setWindowSizeCalls, ["expanded", "compact"], "selecting a history drawer card should surface it as the compact card");
  assert.ok(container.querySelector(".compact-thread-card"), "expected history drawer selection to open the compact card surface");
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

test("workbench waiting thread shows waiting-on plus meanwhile guidance", async () => {
  const savedThreadCache = sampleCard.threadCache;
  sampleCard.threadCache = {
    ...savedThreadCache,
    nextMove: "先把 B 的验收补完。",
    meanwhile: "先把 B 的验收补完。",
    waitingOn: "A 还在等别人回复",
    sideThread: "A 还在等别人回复，回音没来前先别围着它空转。",
  };

  try {
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
    assert.ok(threadPanel);
    assert.match(threadPanel.textContent ?? "", /这条线现在在等：A 还在等别人回复/);
    assert.match(threadPanel.textContent ?? "", /不用干等，先推进：先把 B 的验收补完/);

    await act(async () => {
      root.unmount();
    });

    cleanup();
    await cleanupBundle();
  } finally {
    sampleCard.threadCache = savedThreadCache;
  }
});

test("workbench stale waiting thread urges a different move instead of idle waiting", async () => {
  const savedThreadCache = sampleCard.threadCache;
  const savedCreatedAt = sampleCard.createdAt;
  const savedRememberedThread = sampleStatus.pet.rememberedThread;
  sampleCard.createdAt = Date.now() - 26 * 60 * 60 * 1000;
  sampleStatus.pet.rememberedThread = {
    cardId: sampleCard.id,
    title: sampleCard.title,
    createdAt: sampleCard.createdAt,
  };
  sampleCard.threadCache = {
    ...savedThreadCache,
    nextMove: "先把 B 的验收补完。",
    meanwhile: "先把 B 的验收补完。",
    waitingOn: "A 还在等别人回复",
    sideThread: "A 还在等别人回复，回音没来前先别围着它空转。",
  };

  try {
    const { App, cleanupBundle } = await buildAppModule();
    const { cleanup, setWindowSizeCalls, updateWorklineLifecycleCalls } = setupDom();
    const container = document.getElementById("root");
    assert.ok(container);

    const root = ReactDOMClient.createRoot(container);

    await act(async () => {
      root.render(React.createElement(App));
    });

    await openNestWithContextMenu(container);
    assert.deepEqual(setWindowSizeCalls, ["expanded"]);

    const threadPanel = container.querySelector(".pet-workbench-thread-panel");
    assert.ok(threadPanel);
    assert.match(threadPanel.textContent ?? "", /这条线别再干等了：A 还在等别人回复/);
    assert.match(threadPanel.textContent ?? "", /先做别的，别围着它空转：先把 B 的验收补完/);

    await act(async () => {
      root.unmount();
    });

    cleanup();
    await cleanupBundle();
  } finally {
    sampleCard.threadCache = savedThreadCache;
    sampleCard.createdAt = savedCreatedAt;
    sampleStatus.pet.rememberedThread = savedRememberedThread;
  }
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
  const savedThreadCache = sampleCard.threadCache;
  sampleCard.threadCache = {
    ...savedThreadCache,
    nextMove: "先把 B 的验收补完。",
    meanwhile: "先把 B 的验收补完。",
    waitingOn: "A 还在等别人回复",
    sideThread: "A 还在等别人回复，回音没来前先别围着它空转。",
  };

  try {
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
  assert.match(threadPanel.textContent ?? "", /这条线现在在等：A 还在等别人回复/);
  assert.match(threadPanel.textContent ?? "", /不用干等，先推进：先把 B 的验收补完/);

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
  assert.doesNotMatch(container.textContent ?? "", /这条线现在在等：A 还在等别人回复/);
  assert.doesNotMatch(container.textContent ?? "", /不用干等，先推进：先把 B 的验收补完/);
  assert.match(container.textContent ?? "", /这条线等回来了，直接顺着当前下一步往下接。/);

  await act(async () => {
    root.unmount();
  });

  cleanup();
    await cleanupBundle();
  } finally {
    sampleCard.threadCache = savedThreadCache;
  }
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

  const textarea = container.querySelector("textarea");
  assert.ok(textarea, "expected workbench textarea");
  await setFormControlValue(textarea, "A 在等别人回复，这会儿先把 B 的验收补完。别围着 A 干等。");
  assert.match(textarea.value, /这会儿先把 B 的验收补完/);

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

test("daily close-line appears inside the workbench and can be skipped for today", async () => {
  const { App, cleanupBundle } = await buildAppModule();
  const { cleanup, dailyCloseLineSkips, setDailyCloseLineCandidates } = setupDom();
  setDailyCloseLineCandidates([sampleThreadCard]);
  const container = document.getElementById("root");
  assert.ok(container);

  const root = ReactDOMClient.createRoot(container);

  await act(async () => {
    root.render(React.createElement(App));
    await Promise.resolve();
  });
  assert.equal(container.querySelector(".pet-workbench-close-line"), null, "daily close-line should not show on app launch");

  await openNestWithContextMenu(container);
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });

  const closeLinePanel = container.querySelector(".pet-workbench-close-line");
  assert.ok(closeLinePanel, "expected daily close-line inside the workbench");
  assert.match(closeLinePanel.textContent ?? "", /这些我今天还要继续替你守吗/);
  assert.match(closeLinePanel.textContent ?? "", /今天先不问/);
  for (const label of ["继续守着", "明天接", "沉淀", "放下"]) {
    assert.match(closeLinePanel.textContent ?? "", new RegExp(label), `expected daily close-line action ${label}`);
  }

  const skipButton = Array.from(closeLinePanel.querySelectorAll("button")).find((button) =>
    button.textContent?.includes("今天先不问")
  );
  assert.ok(skipButton, "expected skip-today action");

  await act(async () => {
    skipButton.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await new Promise((resolve) => setTimeout(resolve, 0));
  });

  assert.deepEqual(dailyCloseLineSkips, [[sampleThreadCard.id]]);
  assert.equal(container.querySelector(".pet-workbench-close-line"), null, "skip should dismiss the daily close-line panel");

  await act(async () => {
    root.unmount();
  });

  cleanup();
  await cleanupBundle();
});

test("hot cap choice offers replacement, later, and drop without exposing engineering states", async () => {
  const savedLifecycleFields = sampleHistory.map((card) => ({
    card,
    lifecycleStatus: card.lifecycleStatus,
    ttlAt: card.ttlAt,
  }));
  const activeTtl = Date.now() + 60 * 60 * 1000;
  sampleCard.lifecycleStatus = "hot";
  sampleCard.ttlAt = activeTtl;
  sampleThreadCard.lifecycleStatus = "hot";
  sampleThreadCard.ttlAt = activeTtl;
  sampleBacklinkCard.lifecycleStatus = "cooling";
  sampleBacklinkCard.ttlAt = Date.now() - 60 * 1000;

  try {
    const { App, cleanupBundle } = await buildAppModule();
    const { cleanup, setDailyCloseLineCandidates, setHotCapRejectCardId, updateWorklineLifecycleCalls } = setupDom();
    setDailyCloseLineCandidates([sampleBacklinkCard]);
    setHotCapRejectCardId(sampleBacklinkCard.id);
    const container = document.getElementById("root");
    assert.ok(container);

    const root = ReactDOMClient.createRoot(container);

    await act(async () => {
      root.render(React.createElement(App));
      await Promise.resolve();
    });
    await openNestWithContextMenu(container);
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    const closeLinePanel = container.querySelector(".pet-workbench-close-line");
    assert.ok(closeLinePanel);
    const keepButton = Array.from(closeLinePanel.querySelectorAll("button")).find((button) =>
      button.textContent?.includes("继续守着")
    );
    assert.ok(keepButton, "expected keep action to hit hot cap");

    await act(async () => {
      keepButton.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    const hotCapPanel = container.querySelector(".pet-workbench-hot-cap");
    assert.ok(hotCapPanel, "expected hot cap choice panel");
    assert.match(hotCapPanel.textContent ?? "", /我已经在帮你守 3 条线了/);
    assert.match(hotCapPanel.textContent ?? "", /替换：Ship product work/);
    assert.match(hotCapPanel.textContent ?? "", /今天稍后再看/);
    assert.match(hotCapPanel.textContent ?? "", /直接放下/);
    assert.doesNotMatch(hotCapPanel.textContent ?? "", /hot|waiting|cooling|archived|dropped/);

    const laterButton = Array.from(hotCapPanel.querySelectorAll("button")).find((button) =>
      button.textContent?.includes("今天稍后再看")
    );
    assert.ok(laterButton, "expected later action");

    await act(async () => {
      laterButton.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    assert.deepEqual(updateWorklineLifecycleCalls, [
      [sampleBacklinkCard.id, "continue_guarding"],
      [sampleBacklinkCard.id, "later_today"],
    ]);
    assert.equal(container.querySelector(".pet-workbench-hot-cap"), null, "later choice should dismiss hot cap panel");

    await act(async () => {
      root.unmount();
    });

    cleanup();
    await cleanupBundle();
  } finally {
    for (const { card, lifecycleStatus, ttlAt } of savedLifecycleFields) {
      if (lifecycleStatus === undefined) {
        delete card.lifecycleStatus;
      } else {
        card.lifecycleStatus = lifecycleStatus;
      }
      if (ttlAt === undefined) {
        delete card.ttlAt;
      } else {
        card.ttlAt = ttlAt;
      }
    }
  }
});

test("workbench restores an unsent note draft after remount", async () => {
  const draft = "A 还没回，先把 B 的验收补完，别丢这个草稿。";
  const { App, cleanupBundle } = await buildAppModule();
  const { cleanup } = setupDom();
  const container = document.getElementById("root");
  assert.ok(container);

  let root = ReactDOMClient.createRoot(container);

  await act(async () => {
    root.render(React.createElement(App));
    await Promise.resolve();
  });
  await openNestWithContextMenu(container);

  const textarea = container.querySelector("textarea");
  assert.ok(textarea, "expected workbench textarea");
  await setFormControlValue(textarea, draft);
  assert.equal(window.localStorage.getItem("driftpet:chaos-text-draft"), draft);

  await act(async () => {
    root.unmount();
  });

  container.innerHTML = "";
  root = ReactDOMClient.createRoot(container);
  await act(async () => {
    root.render(React.createElement(App));
    await Promise.resolve();
  });
  await openNestWithContextMenu(container);

  const restoredTextarea = container.querySelector("textarea");
  assert.ok(restoredTextarea, "expected workbench textarea after remount");
  assert.equal(restoredTextarea.value, draft, "expected unsent workbench draft to be restored");

  await act(async () => {
    root.unmount();
  });

  cleanup();
  await cleanupBundle();
});

test("workbench restores a failed persisted manual note when local draft is empty", async () => {
  const recoveredText = "上次 LLM 失败前已经写进去的内容，需要回到输入框。";
  const { App, cleanupBundle } = await buildAppModule();
  const { cleanup, setRecoverableChaosDraft } = setupDom();
  setRecoverableChaosDraft({
    itemId: 88,
    rawText: recoveredText,
    status: "failed",
    receivedAt: Date.now() - 5000,
    lastError: "LLM timed out",
  });
  const container = document.getElementById("root");
  assert.ok(container);

  const root = ReactDOMClient.createRoot(container);

  await act(async () => {
    root.render(React.createElement(App));
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  await openNestWithContextMenu(container);

  const textarea = container.querySelector("textarea");
  assert.ok(textarea, "expected workbench textarea");
  assert.equal(textarea.value, recoveredText, "expected persisted failed note to be restored");
  assert.equal(window.localStorage.getItem("driftpet:chaos-text-draft"), recoveredText);
  assert.match(container.textContent ?? "", /上次没收好的内容已放回输入框。/);

  await act(async () => {
    root.unmount();
  });

  cleanup();
  await cleanupBundle();
});

test("successful workbench capture clears the restored draft", async () => {
  const { App, cleanupBundle } = await buildAppModule();
  const { cleanup } = setupDom();
  window.localStorage.setItem("driftpet:chaos-text-draft", "这个草稿提交成功后应该清掉。");
  const container = document.getElementById("root");
  assert.ok(container);

  const root = ReactDOMClient.createRoot(container);

  await act(async () => {
    root.render(React.createElement(App));
    await Promise.resolve();
  });
  await openNestWithContextMenu(container);

  const textarea = container.querySelector("textarea");
  assert.ok(textarea, "expected workbench textarea");
  assert.match(textarea.value, /提交成功后应该清掉/);

  const submitButton = Array.from(container.querySelectorAll("button")).find((button) => button.textContent?.includes("交给它守"));
  assert.ok(submitButton, "expected submit button");

  await act(async () => {
    submitButton.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await new Promise((resolve) => setTimeout(resolve, 0));
  });

  assert.equal(window.localStorage.getItem("driftpet:chaos-text-draft"), null);

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
  const { cleanup, updateWorklineLifecycleCalls, setWindowSizeCalls } = setupDom();
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

  const compactCard = container.querySelector(".compact-thread-card");
  assert.ok(compactCard, "expected compact mode to promote the remembered thread into the main reading card");
  const compactTitle = compactCard.querySelector(".compact-thread-card-title");
  assert.ok(compactTitle, "expected compact mode to render a main thread title");
  assert.equal(compactTitle.textContent, "Ship product work instead of polishing infra");
  assert.match(compactCard.textContent ?? "", /先放下/);
  assert.match(compactCard.textContent ?? "", /Keep infrastructure polish as a deferred branch/);
  assert.match(compactCard.textContent ?? "", /下一步/);
  assert.match(compactCard.textContent ?? "", /Return to the core desk pet loop/);
  assert.match(compactCard.textContent ?? "", /当前判断/);
  assert.match(compactCard.textContent ?? "", /Do not widen the shell/);
  assert.match(compactCard.textContent ?? "", /别再走/);
  assert.match(compactCard.textContent ?? "", /desk pet loop is stable/);

  // Memory hint inside PetPresence should yield to the full compact card so the same thread is not echoed twice.
  const presenceMemoryButton = container.querySelector(".pet-presence-card[data-memory-active=\"true\"], .pet-presence-card .pet-presence-memory");
  assert.equal(presenceMemoryButton, null, "expected the presence memory hint to step aside while the compact thread card is on screen");

  // Releasing the thread from compact mode should stop guarding it without deleting it.
  const compactCloseButton = compactCard.querySelector(".compact-thread-card-close");
  assert.ok(compactCloseButton, "expected compact card to expose a close action");
  assert.match(compactCloseButton.textContent ?? "", /回到守线/);

  await act(async () => {
    compactCloseButton.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await new Promise((resolve) => setTimeout(resolve, 0));
  });

  const resumeCard = container.querySelector(".pet-resume-card");
  assert.ok(resumeCard, "expected the release card to return once compact mode closes the main thread card");
  const collapseButton = resumeCard.querySelector(".pet-resume-card-secondary");
  assert.match(collapseButton.textContent ?? "", /放下这条/);

  await act(async () => {
    collapseButton.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await new Promise((resolve) => setTimeout(resolve, 0));
  });

  assert.equal(container.querySelector(".pet-resume-card"), null, "expected the resume card to disappear after release");
  assert.deepEqual(setWindowSizeCalls, ["compact", "mini"], "releasing the remembered thread from compact should return the app to mini mode");
  assert.deepEqual(updateWorklineLifecycleCalls, [[sampleCard.id, "drop"]], "release should drop the remembered thread card");
  assert.ok(container.querySelector(".pet-avatar-button-mini"), "after release the app should fall back to the pure mini pet state");

  await act(async () => {
    root.unmount();
  });

  cleanup();
  await cleanupBundle();
});

test("released remembered thread stays visible in history with a just-released marker", async () => {
  const { App, cleanupBundle } = await buildAppModule();
  const { cleanup, updateWorklineLifecycleCalls, setWindowSizeCalls } = setupDom();
  const container = document.getElementById("root");
  assert.ok(container);

  const root = ReactDOMClient.createRoot(container);

  await act(async () => {
    root.render(React.createElement(App));
    await new Promise((resolve) => setTimeout(resolve, 0));
  });

  const miniResumeButton = container.querySelector(".pet-mini-resume-thread");
  assert.ok(miniResumeButton, "expected remembered thread entry in mini mode");

  await act(async () => {
    miniResumeButton.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await new Promise((resolve) => setTimeout(resolve, 0));
  });

  const compactCard = container.querySelector(".compact-thread-card");
  assert.ok(compactCard, "expected remembered thread compact card before release");

  const compactCloseButton = compactCard.querySelector(".compact-thread-card-close");
  assert.ok(compactCloseButton, "expected compact card close action");

  await act(async () => {
    compactCloseButton.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await new Promise((resolve) => setTimeout(resolve, 0));
  });

  const resumeCard = container.querySelector(".pet-resume-card");
  assert.ok(resumeCard, "expected resume summary after closing compact card");
  const releaseButton = resumeCard.querySelector(".pet-resume-card-secondary");
  assert.ok(releaseButton, "expected release action");

  await act(async () => {
    releaseButton.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await new Promise((resolve) => setTimeout(resolve, 0));
  });

  assert.deepEqual(updateWorklineLifecycleCalls, [[sampleCard.id, "drop"]], "release should drop the remembered thread card");
  assert.deepEqual(setWindowSizeCalls, ["compact", "mini"], "release should return the app to mini mode");

  await openNestWithContextMenu(container);

  const logToggle = Array.from(container.querySelectorAll("button")).find((button) => button.textContent?.includes("放下的线"));
  assert.ok(logToggle, "expected show log button after reopening the nest");

  await act(async () => {
    logToggle.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await Promise.resolve();
  });

  const historyDrawer = container.querySelector(".history-drawer.open");
  assert.ok(historyDrawer, "expected history drawer after reopening the nest");

  const releasedCard = Array.from(historyDrawer.querySelectorAll(".history-card")).find((card) =>
    (card.textContent ?? "").includes("Ship product work instead of polishing infra")
  );
  assert.ok(releasedCard, "expected released thread card to stay in history");

  const releasedAge = releasedCard.querySelector(".history-memory-age");
  assert.ok(releasedAge, "expected history age label");
  assert.equal(releasedAge.textContent, "刚放下");

  const releasedShell = releasedCard.closest(".history-card-shell");
  assert.ok(releasedShell, "expected released card shell");
  const recoverButton = Array.from(releasedShell.querySelectorAll("button")).find((button) =>
    button.textContent?.includes("需要时找回")
  );
  assert.ok(recoverButton, "expected a low-presence recovery action for a recently dropped line");

  await act(async () => {
    recoverButton.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await new Promise((resolve) => setTimeout(resolve, 0));
  });

  assert.deepEqual(updateWorklineLifecycleCalls, [
    [sampleCard.id, "drop"],
    [sampleCard.id, "recover"],
  ], "recovery should return the dropped line to the light queue, not hot");

  await act(async () => {
    root.unmount();
  });

  cleanup();
  await cleanupBundle();
});

test("released remembered thread is also marked inside the workbench history fold", async () => {
  const { App, cleanupBundle } = await buildAppModule();
  const { cleanup, setWindowSizeCalls } = setupDom();
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

  const compactCloseButton = container.querySelector(".compact-thread-card-close");
  assert.ok(compactCloseButton);

  await act(async () => {
    compactCloseButton.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await new Promise((resolve) => setTimeout(resolve, 0));
  });

  const releaseButton = container.querySelector(".pet-resume-card-secondary");
  assert.ok(releaseButton);

  await act(async () => {
    releaseButton.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await new Promise((resolve) => setTimeout(resolve, 0));
  });

  assert.deepEqual(setWindowSizeCalls, ["compact", "mini"]);

  await openNestWithContextMenu(container);

  const foldToggle = container.querySelector(".pet-workbench-history-toggle");
  assert.ok(foldToggle, "expected workbench history fold toggle");

  await act(async () => {
    foldToggle.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await Promise.resolve();
  });

  const historyList = container.querySelector(".pet-workbench-history-list");
  assert.ok(historyList, "expected workbench history list");
  const firstItem = historyList.querySelector(".pet-workbench-history-item");
  assert.ok(firstItem, "expected at least one workbench history item");
  assert.match(firstItem.textContent ?? "", /刚放下/);
  assert.match(firstItem.textContent ?? "", /Ship product work instead of polishing infra/);

  await act(async () => {
    firstItem.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await new Promise((resolve) => setTimeout(resolve, 0));
  });

  assert.deepEqual(setWindowSizeCalls, ["compact", "mini", "expanded", "compact"]);
  assert.ok(container.querySelector(".compact-thread-card"), "expected the just-released line to reopen as a compact card from the workbench history fold");

  await act(async () => {
    root.unmount();
  });

  cleanup();
  await cleanupBundle();
});

test("workbench history prioritizes the just-released line to the top", async () => {
  const { App, cleanupBundle } = await buildAppModule();
  const { cleanup, setWindowSizeCalls } = setupDom();
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

  const compactCloseButton = container.querySelector(".compact-thread-card-close");
  assert.ok(compactCloseButton);

  await act(async () => {
    compactCloseButton.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await new Promise((resolve) => setTimeout(resolve, 0));
  });

  const releaseButton = container.querySelector(".pet-resume-card-secondary");
  assert.ok(releaseButton);

  await act(async () => {
    releaseButton.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await new Promise((resolve) => setTimeout(resolve, 0));
  });

  assert.deepEqual(setWindowSizeCalls, ["compact", "mini"]);

  await openNestWithContextMenu(container);

  const foldToggle = container.querySelector(".pet-workbench-history-toggle");
  assert.ok(foldToggle);

  await act(async () => {
    foldToggle.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await Promise.resolve();
  });

  const items = container.querySelectorAll(".pet-workbench-history-item");
  assert.ok(items.length >= 2, "expected multiple workbench history items");
  assert.match(items[0].textContent ?? "", /刚放下/);
  assert.match(items[0].textContent ?? "", /Ship product work instead of polishing infra/);

  await act(async () => {
    root.unmount();
  });

  cleanup();
  await cleanupBundle();
});

test("closing a compact card opened from expanded history returns to the workbench", async () => {
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

  const foldToggle = container.querySelector(".pet-workbench-history-toggle");
  assert.ok(foldToggle);

  await act(async () => {
    foldToggle.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await Promise.resolve();
  });

  const firstItem = container.querySelector(".pet-workbench-history-item");
  assert.ok(firstItem);

  await act(async () => {
    firstItem.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await new Promise((resolve) => setTimeout(resolve, 0));
  });

  assert.ok(container.querySelector(".compact-thread-card"));
  assert.deepEqual(setWindowSizeCalls, ["expanded", "compact"]);

  const closeButton = container.querySelector(".compact-thread-card-close");
  assert.ok(closeButton);
  assert.match(closeButton.textContent ?? "", /回到小窝/);

  await act(async () => {
    closeButton.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await new Promise((resolve) => setTimeout(resolve, 0));
  });

  assert.equal(container.querySelector(".compact-thread-card"), null, "closing should leave compact card mode");
  assert.ok(container.querySelector(".pet-workbench"), "closing an expanded-origin compact card should return to the workbench");
  assert.deepEqual(setWindowSizeCalls, ["expanded", "compact", "expanded"]);

  await act(async () => {
    root.unmount();
  });

  cleanup();
  await cleanupBundle();
});

test("compact waiting thread separates waiting-on from the meanwhile move", async () => {
  const savedThreadCache = sampleCard.threadCache;
  sampleCard.threadCache = {
    ...savedThreadCache,
    nextMove: "先把 B 的验收补完。",
    meanwhile: "先把 B 的验收补完。",
    waitingOn: "A 还在等别人回复",
    sideThread: "A 还在等别人回复，回音没来前先别围着它空转。",
  };

  try {
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

    const compactCard = container.querySelector(".compact-thread-card");
    assert.ok(compactCard);
    assert.match(compactCard.textContent ?? "", /正在等/);
    assert.match(compactCard.textContent ?? "", /A 还在等别人回复/);
    assert.match(compactCard.textContent ?? "", /先推进/);
    assert.match(compactCard.textContent ?? "", /先把 B 的验收补完/);

    await act(async () => {
      root.unmount();
    });

    cleanup();
    await cleanupBundle();
  } finally {
    sampleCard.threadCache = savedThreadCache;
  }
});

test("compact cold waiting summary suggests releasing the line", async () => {
  const savedThreadCache = sampleCard.threadCache;
  const savedCreatedAt = sampleCard.createdAt;
  const savedRememberedThread = sampleStatus.pet.rememberedThread;
  sampleCard.createdAt = Date.now() - 26 * 60 * 60 * 1000;
  sampleStatus.pet.rememberedThread = {
    cardId: sampleCard.id,
    title: sampleCard.title,
    createdAt: sampleCard.createdAt,
  };
  sampleCard.threadCache = {
    ...savedThreadCache,
    nextMove: "先把 B 的验收补完。",
    meanwhile: "先把 B 的验收补完。",
    waitingOn: "A 还在等别人回复",
    sideThread: "A 还在等别人回复，回音没来前先别围着它空转。",
  };

  try {
    const { App, cleanupBundle } = await buildAppModule();
    const { cleanup } = setupDom();
    const container = document.getElementById("root");
    assert.ok(container);

    const root = ReactDOMClient.createRoot(container);

    await act(async () => {
      root.render(React.createElement(App));
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    const noteBubble = container.querySelector(".pet-click-bubble");
    assert.ok(noteBubble);

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 4300));
    });

    const miniResumeButton = container.querySelector(".pet-mini-resume-thread");
    assert.ok(miniResumeButton);

    await act(async () => {
      miniResumeButton.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    const compactCard = container.querySelector(".compact-thread-card");
    assert.ok(compactCard);

    await act(async () => {
      const closeButton = compactCard.querySelector(".compact-thread-card-close");
      assert.ok(closeButton);
      closeButton.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    const resumeCard = container.querySelector(".pet-resume-card");
    assert.ok(resumeCard);
    const releaseButton = resumeCard.querySelector(".pet-resume-card-secondary");
    assert.ok(releaseButton);
    assert.match(releaseButton.textContent ?? "", /先放下这条/);

    await act(async () => {
      root.unmount();
    });

    cleanup();
    await cleanupBundle();
  } finally {
    sampleCard.createdAt = savedCreatedAt;
    sampleStatus.pet.rememberedThread = savedRememberedThread;
    sampleCard.threadCache = savedThreadCache;
  }
});

test("mini remembered thread shows resolved waiting after thread result capture", async () => {
  const savedThreadCache = sampleCard.threadCache;
  sampleCard.threadCache = {
    ...savedThreadCache,
    nextMove: "先把 B 的验收补完。",
    meanwhile: "先把 B 的验收补完。",
    waitingOn: "A 还在等别人回复",
    sideThread: "A 还在等别人回复，回音没来前先别围着它空转。",
  };

  try {
    const { App, cleanupBundle } = await buildAppModule();
    const { cleanup, captureClaudeDispatchResultCalls, dispatchClaudeThreadCalls, setWindowSizeCalls } = setupDom();
    const container = document.getElementById("root");
    assert.ok(container);

    const root = ReactDOMClient.createRoot(container);

    await act(async () => {
      root.render(React.createElement(App));
      await Promise.resolve();
      await Promise.resolve();
    });

    const miniResumeButton = container.querySelector(".pet-mini-resume-thread");
    assert.ok(miniResumeButton);
    assert.match(miniResumeButton.textContent ?? "", /正在等/);
    assert.match(miniResumeButton.textContent ?? "", /A 还在等别人回复/);

    await act(async () => {
      miniResumeButton.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
      await Promise.resolve();
    });

    assert.deepEqual(setWindowSizeCalls, ["compact"]);
    const compactCard = container.querySelector(".compact-thread-card");
    assert.ok(compactCard);

    await act(async () => {
      const closeButton = compactCard.querySelector(".compact-thread-card-close");
      assert.ok(closeButton);
      closeButton.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
      await Promise.resolve();
    });

    await openNestWithContextMenu(container);
    assert.deepEqual(setWindowSizeCalls, ["compact", "expanded"]);

    const dispatchThreadButton = Array.from(container.querySelectorAll("button")).find((button) =>
      button.textContent?.includes("派给 Claude Code（整条线）")
    );
    assert.ok(dispatchThreadButton);

    await act(async () => {
      dispatchThreadButton.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
      await Promise.resolve();
    });

    assert.deepEqual(dispatchClaudeThreadCalls, [sampleCard.id]);

    const threadPanel = container.querySelector(".pet-workbench-thread-panel");
    assert.ok(threadPanel);
    const recordResultButton = Array.from(threadPanel.querySelectorAll("button")).find((button) => button.textContent?.includes("记录结果"));
    assert.ok(recordResultButton);

    await act(async () => {
      recordResultButton.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    const resultInput = threadPanel.querySelector(".pet-workbench-thread-result-input");
    assert.ok(resultInput);
    await setFormControlValue(resultInput, "Resolved the waiting path.");

    const saveResultButton = Array.from(threadPanel.querySelectorAll("button")).find((button) => button.textContent?.includes("保存结果"));
    assert.ok(saveResultButton);

    await act(async () => {
      saveResultButton.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
      await Promise.resolve();
    });

    assert.deepEqual(captureClaudeDispatchResultCalls, [
      [sampleCard.id, "Resolved the waiting path."],
    ]);

    const freshResolveStrip = container.querySelector(".pet-workbench-fresh-resolve-strip");
    assert.ok(freshResolveStrip, "expected a temporary priority strip after the waiting line resolves");
    assert.match(freshResolveStrip.textContent ?? "", /优先接回/);
    assert.match(freshResolveStrip.textContent ?? "", /Claude 结果刚记回这条线/);

    const freshResolveButton = freshResolveStrip.querySelector(".pet-workbench-fresh-resolve-button");
    assert.ok(freshResolveButton, "expected direct resume button in the priority strip");

    const returnButton = container.querySelector("button.workbench-return");
    assert.ok(returnButton);

    await act(async () => {
      returnButton.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
      await Promise.resolve();
    });

    assert.deepEqual(setWindowSizeCalls, ["compact", "expanded", "mini"]);

    const resolvedNoteBubble = container.querySelector(".pet-click-bubble");
    assert.ok(resolvedNoteBubble);
    assert.match(resolvedNoteBubble.textContent ?? "", /等回来了/);

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 3600));
    });

    const resolvedMiniResumeButton = container.querySelector(".pet-mini-resume-thread");
    assert.ok(resolvedMiniResumeButton);
    assert.doesNotMatch(resolvedMiniResumeButton.textContent ?? "", /A 还在等别人回复/);
    assert.doesNotMatch(resolvedMiniResumeButton.textContent ?? "", /等回来了，接着做/);

    await act(async () => {
      root.unmount();
    });

    cleanup();
    await cleanupBundle();
  } finally {
    sampleCard.threadCache = savedThreadCache;
  }
});

test("fresh resolve priority strip can reopen the remembered line directly", async () => {
  const savedThreadCache = sampleCard.threadCache;
  sampleCard.threadCache = {
    ...savedThreadCache,
    nextMove: "先把 B 的验收补完。",
    meanwhile: "先把 B 的验收补完。",
    waitingOn: "A 还在等别人回复",
    sideThread: "A 还在等别人回复，回音没来前先别围着它空转。",
  };

  try {
    const { App, cleanupBundle } = await buildAppModule();
    const { cleanup, captureClaudeDispatchResultCalls, dispatchClaudeThreadCalls, setWindowSizeCalls } = setupDom();
    const container = document.getElementById("root");
    assert.ok(container);

    const root = ReactDOMClient.createRoot(container);

    await act(async () => {
      root.render(React.createElement(App));
      await Promise.resolve();
      await Promise.resolve();
    });

    const miniResumeButton = container.querySelector(".pet-mini-resume-thread");
    assert.ok(miniResumeButton);

    await act(async () => {
      miniResumeButton.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
      await Promise.resolve();
    });

    const compactCard = container.querySelector(".compact-thread-card");
    assert.ok(compactCard);

    await act(async () => {
      const closeButton = compactCard.querySelector(".compact-thread-card-close");
      assert.ok(closeButton);
      closeButton.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
      await Promise.resolve();
    });

    await openNestWithContextMenu(container);
    assert.deepEqual(setWindowSizeCalls, ["compact", "expanded"]);

    const dispatchThreadButton = Array.from(container.querySelectorAll("button")).find((button) =>
      button.textContent?.includes("派给 Claude Code（整条线）")
    );
    assert.ok(dispatchThreadButton);

    await act(async () => {
      dispatchThreadButton.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
      await Promise.resolve();
    });

    assert.deepEqual(dispatchClaudeThreadCalls, [sampleCard.id]);

    const threadPanel = container.querySelector(".pet-workbench-thread-panel");
    assert.ok(threadPanel);
    const recordResultButton = Array.from(threadPanel.querySelectorAll("button")).find((button) => button.textContent?.includes("记录结果"));
    assert.ok(recordResultButton);

    await act(async () => {
      recordResultButton.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    const resultInput = threadPanel.querySelector(".pet-workbench-thread-result-input");
    assert.ok(resultInput);
    await setFormControlValue(resultInput, "Resolved the waiting path.");

    const saveResultButton = Array.from(threadPanel.querySelectorAll("button")).find((button) => button.textContent?.includes("保存结果"));
    assert.ok(saveResultButton);

    await act(async () => {
      saveResultButton.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
      await Promise.resolve();
    });

    assert.deepEqual(captureClaudeDispatchResultCalls, [
      [sampleCard.id, "Resolved the waiting path."],
    ]);

    const freshResolveStrip = container.querySelector(".pet-workbench-fresh-resolve-strip");
    assert.ok(freshResolveStrip);
    const freshResolveButton = freshResolveStrip.querySelector(".pet-workbench-fresh-resolve-button");
    assert.ok(freshResolveButton);

    await act(async () => {
      freshResolveButton.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
      await Promise.resolve();
    });

    assert.deepEqual(setWindowSizeCalls, ["compact", "expanded", "compact"]);
    assert.ok(container.querySelector(".compact-thread-card"), "expected priority strip resume to reopen the compact card directly");

    await act(async () => {
      root.unmount();
    });

    cleanup();
    await cleanupBundle();
  } finally {
    sampleCard.threadCache = savedThreadCache;
  }
});

test("mini resolved waiting hint settles back to the normal next move after a while", async () => {
  const savedThreadCache = sampleCard.threadCache;
  sampleCard.threadCache = {
    ...savedThreadCache,
    nextMove: "先把 B 的验收补完。",
    meanwhile: null,
    waitingOn: null,
    waitingResolvedAt: Date.now() - 3 * 60 * 60 * 1000,
    sideThread: "A 还在等别人回复，回音没来前先别围着它空转。",
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
    assert.ok(resumeThread);
    assert.doesNotMatch(resumeThread.textContent ?? "", /等回来了，接着做/);
    assert.match(resumeThread.textContent ?? "", /下一手/);
    assert.match(resumeThread.textContent ?? "", /先把 B 的验收补完/);

    await act(async () => {
      root.unmount();
    });

    cleanup();
    await cleanupBundle();
  } finally {
    sampleCard.threadCache = savedThreadCache;
  }
});

test("mini mode surfaces a fresh resolved waiting reminder once", async () => {
  const savedThreadCache = sampleCard.threadCache;
  sampleCard.threadCache = {
    ...savedThreadCache,
    nextMove: "先把 B 的验收补完。",
    meanwhile: null,
    waitingOn: null,
    waitingResolvedAt: Date.now() - 20 * 1000,
    sideThread: "A 还在等别人回复，回音没来前先别围着它空转。",
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

    const noteBubble = container.querySelector(".pet-click-bubble");
    assert.ok(noteBubble, "expected the mini pet note bubble for a just-resolved waiting thread");
    assert.match(noteBubble.textContent ?? "", /等回来了/);

    await act(async () => {
      root.unmount();
    });

    cleanup();
    await cleanupBundle();
  } finally {
    sampleCard.threadCache = savedThreadCache;
  }
});

test("compact active thread becomes a pure workspace card without the pet", async () => {
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
  assert.ok(miniResumeButton, "expected mini mode to expose a remembered-thread entry");

  await act(async () => {
    miniResumeButton.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await new Promise((resolve) => setTimeout(resolve, 0));
  });

  assert.ok(container.querySelector(".compact-thread-card"), "expected the compact workspace card to render");
  assert.equal(container.querySelector(".pet-avatar-button-compact"), null, "compact resume mode should not embed the desktop pet");
  assert.equal(container.querySelector(".pet-actions-compact"), null, "compact resume mode should not show the pet control strip");

  const css = await fs.readFile(rendererStyles, "utf8");
  const shellCompact = getCssBlock(css, ".pet-shell-compact");
  const threadCard = getCssBlock(css, ".compact-thread-card");

  assert.match(shellCompact, /grid-template-rows:\s*minmax\(0,\s*1fr\);/, "compact shell should dedicate the whole stage to the workspace card");
  assert.match(threadCard, /grid-template-rows:\s*auto auto minmax\(0,\s*1fr\) auto;/, "compact thread card should own the main reading surface");
  assert.match(threadCard, /height:\s*100%;/, "compact thread card should expand to the full compact workspace height");
  assert.match(threadCard, /width:\s*100%;/, "compact thread card should use the full compact workspace width");

  await act(async () => {
    root.unmount();
  });

  cleanup();
  await cleanupBundle();
});

test("escape in compact full-card mode returns to remembered summary before mini", async () => {
  const { App, cleanupBundle } = await buildAppModule();
  const { cleanup, setWindowSizeCalls } = setupDom();
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

  assert.ok(container.querySelector(".compact-thread-card"), "expected compact full card before Escape");

  await act(async () => {
    window.dispatchEvent(new window.KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    await new Promise((resolve) => setTimeout(resolve, 0));
  });

  assert.equal(container.querySelector(".compact-thread-card"), null, "first Escape should close the compact full card");
  assert.ok(container.querySelector(".pet-resume-card"), "first Escape should return to remembered summary");
  assert.deepEqual(setWindowSizeCalls, ["compact"], "first Escape should not resize back to mini");

  await act(async () => {
    window.dispatchEvent(new window.KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    await new Promise((resolve) => setTimeout(resolve, 0));
  });

  assert.ok(container.querySelector(".pet-avatar-button-mini"), "second Escape should return to mini");
  assert.deepEqual(setWindowSizeCalls, ["compact", "mini"], "second Escape should resize to mini");

  await act(async () => {
    root.unmount();
  });

  cleanup();
  await cleanupBundle();
});

test("escape from an expanded-origin compact card returns to the workbench", async () => {
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
  const returnToDeskButton = container.querySelector("button.workbench-return");
  assert.ok(returnToDeskButton, "expected workbench return button");
  assert.match(returnToDeskButton.textContent ?? "", /回到桌边/);

  const foldToggle = container.querySelector(".pet-workbench-history-toggle");
  assert.ok(foldToggle);

  await act(async () => {
    foldToggle.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await Promise.resolve();
  });

  const firstItem = container.querySelector(".pet-workbench-history-item");
  assert.ok(firstItem);

  await act(async () => {
    firstItem.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await new Promise((resolve) => setTimeout(resolve, 0));
  });

  assert.ok(container.querySelector(".compact-thread-card"), "expected compact full card before Escape");

  await act(async () => {
    window.dispatchEvent(new window.KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    await new Promise((resolve) => setTimeout(resolve, 0));
  });

  assert.equal(container.querySelector(".compact-thread-card"), null, "Escape should close the expanded-origin compact card");
  assert.ok(container.querySelector(".pet-workbench"), "Escape should return to the expanded workbench");
  assert.deepEqual(setWindowSizeCalls, ["expanded", "compact", "expanded"]);

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
  const returnToDeskButton = container.querySelector("button.workbench-return");
  assert.ok(returnToDeskButton, "expected workbench return button");
  assert.match(returnToDeskButton.textContent ?? "", /回到桌边/);

  const resumeStrip = container.querySelector(".pet-workbench-resume-strip");
  assert.ok(resumeStrip, "expected the resume strip to render at the top of the expanded workbench");
  assert.match(resumeStrip.textContent ?? "", /正在守着的线/);
  assert.match(resumeStrip.textContent ?? "", /Ship product work instead of polishing infra/);
  assert.ok(resumeStrip.querySelector(".pet-workbench-thread-progress"), "expected a progress bar in the resume strip");

  const threadPanelProgress = container.querySelector(".pet-workbench-thread-panel .pet-workbench-thread-progress");
  assert.ok(threadPanelProgress, "expected the current thread panel to show a progress bar");

  assert.equal(container.querySelector(".template-row"), null, "expanded workbench should no longer render preset template chips");
  assert.ok(container.querySelector(".manual-input-hint"), "expected a freeform input hint under the textarea");

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

test("expanded workbench resume strip summarizes active waiting in two short lines", async () => {
  const savedThreadCache = sampleCard.threadCache;
  sampleCard.threadCache = {
    ...savedThreadCache,
    nextMove: "先把 B 的验收补完。",
    meanwhile: "先把 B 的验收补完。",
    waitingOn: "A 还在等别人回复",
    sideThread: "A 还在等别人回复，回音没来前先别围着它空转。",
  };

  try {
    const { App, cleanupBundle } = await buildAppModule();
    const { cleanup, setWindowSizeCalls, updateWorklineLifecycleCalls } = setupDom();
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
    assert.ok(resumeStrip);
    assert.match(resumeStrip.textContent ?? "", /正在等：A 还在等别人回复/);
    assert.match(resumeStrip.textContent ?? "", /先推进：先把 B 的验收补完/);
    const keepGuardingButton = Array.from(resumeStrip.querySelectorAll("button")).find((button) =>
      button.textContent?.includes("继续守着")
    );
    assert.ok(keepGuardingButton, "expected keep-guarding action in active waiting state");

    await act(async () => {
      keepGuardingButton.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    assert.deepEqual(setWindowSizeCalls, ["expanded"], "continuing to guard should keep the user in the workbench");
    assert.deepEqual(updateWorklineLifecycleCalls, [[sampleCard.id, "continue_guarding"]]);
    assert.match(container.textContent ?? "", /好，我继续替你守着这条。/);

    await act(async () => {
      root.unmount();
    });

    cleanup();
    await cleanupBundle();
  } finally {
    sampleCard.threadCache = savedThreadCache;
  }
});

test("expanded workbench resume strip summarizes cold waiting as releasable", async () => {
  const savedThreadCache = sampleCard.threadCache;
  const savedCreatedAt = sampleCard.createdAt;
  const savedRememberedThread = sampleStatus.pet.rememberedThread;
  sampleCard.createdAt = Date.now() - 26 * 60 * 60 * 1000;
  sampleStatus.pet.rememberedThread = {
    cardId: sampleCard.id,
    title: sampleCard.title,
    createdAt: sampleCard.createdAt,
  };
  sampleCard.threadCache = {
    ...savedThreadCache,
    nextMove: "先把 B 的验收补完。",
    meanwhile: "先把 B 的验收补完。",
    waitingOn: "A 还在等别人回复",
    sideThread: "A 还在等别人回复，回音没来前先别围着它空转。",
  };

  try {
    const { App, cleanupBundle } = await buildAppModule();
    const { cleanup, updateWorklineLifecycleCalls, setWindowSizeCalls } = setupDom();
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
    assert.ok(resumeStrip);
    assert.match(resumeStrip.textContent ?? "", /可放下：A 还在等别人回复/);
    assert.match(resumeStrip.textContent ?? "", /先做别的：先把 B 的验收补完/);
    for (const label of ["继续守着", "明天接", "沉淀", "放下"]) {
      assert.match(resumeStrip.textContent ?? "", new RegExp(label), `expected lifecycle action ${label}`);
    }
    const releaseButton = Array.from(resumeStrip.querySelectorAll("button")).find((button) =>
      button.textContent?.includes("放下")
    );
    assert.ok(releaseButton, "expected release action in cold waiting state");

    await act(async () => {
      releaseButton.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    assert.deepEqual(updateWorklineLifecycleCalls, [[sampleCard.id, "drop"]], "cold waiting release should drop the remembered thread card");
    assert.deepEqual(setWindowSizeCalls, ["expanded"], "workbench lifecycle action should keep the nest open");

    await act(async () => {
      root.unmount();
    });

    cleanup();
    await cleanupBundle();
  } finally {
    sampleCard.threadCache = savedThreadCache;
    sampleCard.createdAt = savedCreatedAt;
    sampleStatus.pet.rememberedThread = savedRememberedThread;
  }
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
    await new Promise((resolve) => setTimeout(resolve, 0));
  });

  assert.deepEqual(setWindowSizeCalls, ["expanded", "compact"], "selecting a workbench history item should surface it as the compact card");
  assert.ok(container.querySelector(".compact-thread-card"), "expected selected history item to open in the compact card surface");
  assert.match(container.textContent ?? "", /Ship product work instead of polishing infra/, "selecting a recent card should reveal it on screen");

  await act(async () => {
    root.unmount();
  });

  cleanup();
  await cleanupBundle();
});

test("compact resume mode hides the pet control strip", async () => {
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

  assert.equal(container.querySelector(".pet-actions-compact"), null, "compact resume mode should not render the pet control strip");

  await act(async () => {
    root.unmount();
  });

  cleanup();
  await cleanupBundle();
});

test("collapsed compact remembered-thread mode uses a tighter summary plus smaller pet lane", async () => {
  const css = await fs.readFile(rendererStyles, "utf8");
  const compactRemembered = getCssBlock(css, ".pet-shell-compact-remembered");
  const compactRememberedAvatar = getCssBlock(css, ".pet-shell-compact-remembered .pet-avatar-shell-compact");
  const compactRememberedAvatarButton = getCssBlock(css, ".pet-shell-compact-remembered .pet-avatar-button-compact");
  const compactRememberedResume = getCssBlock(css, ".pet-shell-compact-remembered .pet-resume-card");

  assert.match(compactRemembered, /grid-template-columns:\s*minmax\(0,\s*1fr\)\s+180px;/, "collapsed compact mode should reserve a smaller right lane for the pet");
  assert.match(compactRememberedAvatar, /grid-column:\s*2;/, "collapsed compact pet should stay in the right summary lane");
  assert.match(compactRememberedAvatarButton, /height:\s*164px;/, "collapsed compact pet should be visibly smaller than the default compact pet");
  assert.match(compactRememberedResume, /grid-column:\s*1;/, "collapsed compact summary card should occupy the left content lane");
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

test("mini runtime bubble also widens the mini window", async () => {
  const { App, cleanupBundle } = await buildAppModule();
  const { cleanup, setMiniBubbleVisibleCalls } = setupDom();
  const container = document.getElementById("root");
  assert.ok(container);

  let petdexBubbleListener = null;
  window.driftpet.onPetdexBubble = (listener) => {
    petdexBubbleListener = listener;
    return () => {
      petdexBubbleListener = null;
    };
  };

  const root = ReactDOMClient.createRoot(container);

  await act(async () => {
    root.render(React.createElement(App));
    await new Promise((resolve) => setTimeout(resolve, 0));
  });

  await act(async () => {
    petdexBubbleListener?.({
      text: "这条线先别丢，我替你守着。",
      agentSource: "Petdex",
      updatedAt: Date.now(),
      counter: 1,
    });
    await new Promise((resolve) => setTimeout(resolve, 0));
  });

  assert.ok(container.querySelector(".pet-click-bubble-petdex"), "expected Petdex bubble to render in mini mode");
  assert.equal(setMiniBubbleVisibleCalls.at(-1), true, "Petdex mini bubble should also widen the mini window");

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
