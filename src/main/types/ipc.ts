export const IPC_CHANNELS = {
  showDemo: "pet:show-demo",
  listRecentCards: "cards:list-recent",
  ingestManualText: "ingest:manual-text",
  ingestChaosReset: "ingest:chaos-reset",
  getStatus: "app:get-status",
  cardCreated: "events:card-created"
} as const;
