import test from "node:test";
import assert from "node:assert/strict";

const buildDigestOverride = (enriched) => (
  enriched.processor === null
  || enriched.workflowTitle === null
  || enriched.workflowUseFor === null
  || enriched.workflowKnowledgeTag === null
  || enriched.workflowPetRemark === null
)
  ? undefined
  : {
    title: enriched.workflowTitle,
    useFor: enriched.workflowUseFor,
    knowledgeTag: enriched.workflowKnowledgeTag,
    summaryForRetrieval: enriched.extractedText ?? enriched.rawText,
    petRemark: enriched.workflowPetRemark
  };

test("buildDigestOverride returns deterministic card payload for note workflow", () => {
  const enriched = {
    rawText: "https://example.com/post",
    extractedText: "Skill: article-to-note\n\nArtifact: /Users/mac/my-obsidian-vault/AI/Articles/foo.md",
    processor: "article-to-note",
    workflowTitle: "foo",
    workflowUseFor: "先看生成的笔记是否落在预期目录，再决定要不要继续做二次 ingest 或整理。",
    workflowKnowledgeTag: "article-to-note",
    workflowPetRemark: "链接我已经替你送进本地仓库了。"
  };

  assert.deepEqual(buildDigestOverride(enriched), {
    title: "foo",
    useFor: "先看生成的笔记是否落在预期目录，再决定要不要继续做二次 ingest 或整理。",
    knowledgeTag: "article-to-note",
    summaryForRetrieval: "Skill: article-to-note\n\nArtifact: /Users/mac/my-obsidian-vault/AI/Articles/foo.md",
    petRemark: "链接我已经替你送进本地仓库了。"
  });
});

test("buildDigestOverride returns undefined when workflow metadata is incomplete", () => {
  const enriched = {
    rawText: "https://example.com/post",
    extractedText: null,
    processor: "article-to-note",
    workflowTitle: null,
    workflowUseFor: null,
    workflowKnowledgeTag: null,
    workflowPetRemark: null
  };

  assert.equal(buildDigestOverride(enriched), undefined);
});
