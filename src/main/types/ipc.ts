export const IPC_CHANNELS = {
  showDemo: "pet:show-demo",
  listRecentCards: "cards:list-recent",
  ingestChaosReset: "ingest:chaos-reset",
  setPetHourlyBudget: "pet:set-hourly-budget",
  setWindowSize: "pet:set-window-size",
  setMiniBubbleVisible: "pet:set-mini-bubble-visible",
  moveWindowBy: "pet:move-window-by",
  getStatus: "app:get-status",
  cardCreated: "events:card-created",
  petList: "pet:list",
  petActive: "pet:active",
  petSetActive: "pet:set-active",
  petInstall: "pet:install",
  petActiveChanged: "pet:active-changed"
} as const;
