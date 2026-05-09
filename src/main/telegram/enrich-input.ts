import type { ParsedTelegramInput } from "./parse-message";
import { runUrlNoteWorkflow } from "./url-note-runner";

export const enrichTelegramInput = async (
  input: ParsedTelegramInput
): Promise<ParsedTelegramInput> => {
  if (input.source !== "tg_url" || input.rawUrl === null) {
    return input;
  }

  try {
    const result = await runUrlNoteWorkflow(input.rawUrl);
    return {
      ...input,
      extractedTitle: result.title,
      extractedText: result.summaryText,
      extractionStage: result.extractionStage,
      extractionError: result.extractionError,
      lastError: result.lastError,
      artifactPath: result.artifactPath,
      processor: result.processor,
      itemStatus: result.extractionStage === "note_ingested" ? "digested" : "failed",
      workflowTitle: result.title,
      workflowUseFor: result.useFor,
      workflowKnowledgeTag: result.knowledgeTag,
      workflowPetRemark: result.petRemark
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown note workflow error.";
    return {
      ...input,
      extractedTitle: null,
      extractedText: null,
      extractionStage: "note_failed",
      extractionError: `Note workflow failed: ${message}`,
      lastError: `Note workflow failed: ${message}`,
      artifactPath: null,
      processor: null,
      itemStatus: "failed"
    };
  }
};
