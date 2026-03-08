"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2, RotateCcw, Sparkles, Wand2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { createProject } from "@/lib/project-api";
import { Textarea } from "@/components/ui/textarea";
import {
  createProduct,
  editProduct,
  editProductRegion,
  generateProductDraft,
  recoverProductVersion,
  refineProductConcepts,
  rewindProduct,
  selectProductConcept,
} from "@/lib/product-api";
import { ProductState, ProductStatus } from "@/lib/product-types";

type ProductActionType =
  | "create_brief"
  | "refine_concepts"
  | "choose_concept"
  | "generate_3d_draft"
  | "edit_whole_product"
  | "edit_region"
  | "restyle_materials"
  | "rewind_version"
  | "recover_prior_result";

export interface ProductAIChatPanelProps {
  productState: ProductState | null;
  productStatus: ProductStatus | null;
  onStateRefresh: () => Promise<void> | void;
  isEditInProgress?: never;
  onEditStart?: never;
  onEditComplete?: never;
  onEditError?: never;
  selectedPanelId?: never;
  packageModel?: never;
  onTextureGenerated?: never;
}

const ACTION_LABELS: Record<ProductActionType, string> = {
  create_brief: "Generate 4 Concepts",
  refine_concepts: "Refine Concepts",
  choose_concept: "Choose Concept",
  generate_3d_draft: "Generate Base 3D",
  edit_whole_product: "Edit Whole Product",
  edit_region: "Edit Region",
  restyle_materials: "Restyle Materials",
  rewind_version: "Rewind Version",
  recover_prior_result: "Recover Prior Result",
};

const AVAILABLE_ACTIONS: ProductActionType[] = [
  "create_brief",
  "refine_concepts",
  "choose_concept",
  "generate_3d_draft",
  "edit_whole_product",
  "edit_region",
  "restyle_materials",
  "rewind_version",
  "recover_prior_result",
];

const ACTION_SUGGESTIONS: Partial<Record<ProductActionType, string[]>> = {
  create_brief: [
    "Portable countertop appliance with rounded geometry and premium materials",
    "Compact drinkware concept with a clean ergonomic grip",
  ],
  refine_concepts: [
    "Push it toward a more technical silhouette",
    "Make the direction feel softer and more giftable",
  ],
  edit_whole_product: [
    "Sharpen the silhouette and reduce the toy-like feel",
    "Make the interface more legible from the front view",
  ],
  edit_region: [
    "Refine this area with cleaner edge transitions",
    "Increase contrast and clarity in this region only",
  ],
  restyle_materials: [
    "Shift to brushed aluminum and dark matte polymer",
    "Use warmer materials with lower gloss",
  ],
};

function formatElapsedTime(seconds: number): string {
  if (seconds < 60) {
    return `${seconds}s`;
  }

  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes}m ${remainingSeconds.toString().padStart(2, "0")}s`;
}

function getDefaultAction(state: ProductState | null): ProductActionType {
  if (!state?.design_brief) {
    return "create_brief";
  }
  if (!state.selected_concept_id) {
    return "choose_concept";
  }
  if (!state.active_version_id) {
    return "generate_3d_draft";
  }
  return "edit_whole_product";
}

function isPromptRequired(action: ProductActionType) {
  return [
    "create_brief",
    "refine_concepts",
    "edit_whole_product",
    "edit_region",
    "restyle_materials",
  ].includes(action);
}

function getActionPlaceholder(action: ProductActionType) {
  switch (action) {
    case "create_brief":
      return "Describe the product idea you want to turn into 4 concept images...";
    case "refine_concepts":
      return "Explain how the concept directions should shift...";
    case "choose_concept":
      return "Optional notes about what to preserve in the selected concept...";
    case "generate_3d_draft":
      return "No prompt required. The selected concept image becomes the base 3D model.";
    case "edit_whole_product":
      return "Describe the whole-product change you want to make...";
    case "edit_region":
      return "Describe the targeted region change...";
    case "restyle_materials":
      return "Describe the material or finish shift...";
    case "rewind_version":
      return "No prompt required. Pick a prior iteration to rewind.";
    case "recover_prior_result":
      return "No prompt required. Pick a saved version to recover.";
  }
}

export function ProductAIChatPanel({
  productState,
  productStatus,
  onStateRefresh,
}: ProductAIChatPanelProps) {
  const [action, setAction] = useState<ProductActionType>(() =>
    getDefaultAction(productState),
  );
  const [prompt, setPrompt] = useState("");
  const [selectedConceptId, setSelectedConceptId] = useState<string>("");
  const [selectedRegionId, setSelectedRegionId] = useState<string>("");
  const [selectedVersionId, setSelectedVersionId] = useState<string>("");
  const [selectedIterationIndex, setSelectedIterationIndex] = useState<string>("");
  const [elapsedTime, setElapsedTime] = useState(0);
  const [submitting, setSubmitting] = useState(false);

  const suggestions = ACTION_SUGGESTIONS[action] ?? [];
  const availableVersions = useMemo(
    () => productState?.version_history ?? [],
    [productState?.version_history],
  );
  const availableIterations = useMemo(
    () => productState?.iterations ?? [],
    [productState?.iterations],
  );
  const availableRegions = useMemo(
    () =>
      productState?.named_regions.length
        ? productState.named_regions
        : productState?.editor_state.ai_region_labels ?? [],
    [productState?.editor_state.ai_region_labels, productState?.named_regions],
  );
  const isBusy = Boolean(productState?.in_progress || submitting);

  useEffect(() => {
    setAction((current) =>
      productState?.in_progress ? current : getDefaultAction(productState),
    );
  }, [productState]);

  useEffect(() => {
    setSelectedConceptId(productState?.selected_concept_id ?? "");
  }, [productState?.selected_concept_id]);

  useEffect(() => {
    setSelectedRegionId(availableRegions[0]?.region_id ?? "");
  }, [availableRegions]);

  useEffect(() => {
    const recoverableVersion =
      availableVersions.find(
        (version) => version.version_id !== productState?.active_version_id,
      )?.version_id ?? "";
    setSelectedVersionId(recoverableVersion);
  }, [availableVersions, productState?.active_version_id]);

  useEffect(() => {
    const rewindTarget =
      availableIterations.length > 1 ? String(availableIterations.length - 2) : "";
    setSelectedIterationIndex(rewindTarget);
  }, [availableIterations.length]);

  useEffect(() => {
    if (!productState?.in_progress) {
      setElapsedTime(0);
      return;
    }

    const startTime = productState.generation_started_at
      ? new Date(productState.generation_started_at).getTime()
      : Date.now();

    setElapsedTime(Math.floor((Date.now() - startTime) / 1000));

    const intervalId = setInterval(() => {
      setElapsedTime(Math.floor((Date.now() - startTime) / 1000));
    }, 1000);

    return () => clearInterval(intervalId);
  }, [productState?.generation_started_at, productState?.in_progress]);

  const canSubmit = useMemo(() => {
    if (isBusy) {
      return false;
    }

    if (isPromptRequired(action) && !prompt.trim()) {
      return false;
    }

    if (
      action === "choose_concept" &&
      !selectedConceptId &&
      !productState?.selected_concept_id
    ) {
      return false;
    }

    if (action === "generate_3d_draft" && !productState?.selected_concept_id) {
      return false;
    }

    if (action === "edit_region" && !selectedRegionId) {
      return false;
    }

    if (action === "recover_prior_result" && !selectedVersionId) {
      return false;
    }

    if (action === "rewind_version" && selectedIterationIndex === "") {
      return false;
    }

    return true;
  }, [
    action,
    isBusy,
    productState?.selected_concept_id,
    prompt,
    selectedConceptId,
    selectedIterationIndex,
    selectedRegionId,
    selectedVersionId,
  ]);

  const handleSubmit = async () => {
    if (!canSubmit) {
      return;
    }

    try {
      setSubmitting(true);

      switch (action) {
        case "create_brief":
          await createProject({
            prompt: prompt.trim(),
            lastRoute: "/product",
          });
          await createProduct(prompt.trim(), 4);
          break;
        case "refine_concepts":
          await refineProductConcepts(prompt.trim());
          break;
        case "choose_concept":
          await selectProductConcept(
            selectedConceptId || productState?.selected_concept_id || "",
            { notes: prompt.trim() || undefined },
          );
          break;
        case "generate_3d_draft":
          await generateProductDraft();
          break;
        case "edit_whole_product":
          await editProduct({
            prompt: prompt.trim(),
            editType: "whole_product",
            targetScope: "whole_product",
          });
          break;
        case "edit_region":
          await editProductRegion(prompt.trim(), selectedRegionId);
          break;
        case "restyle_materials":
          await editProduct({
            prompt: prompt.trim(),
            editType: "restyle_materials",
            targetScope: "whole_product",
          });
          break;
        case "rewind_version":
          await rewindProduct(Number(selectedIterationIndex));
          break;
        case "recover_prior_result":
          await recoverProductVersion(selectedVersionId);
          break;
      }

      if (action !== "generate_3d_draft") {
        setPrompt("");
      }
      await onStateRefresh();
    } catch (error) {
      alert(error instanceof Error ? error.message : "Product action failed.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-4">
      {productState?.in_progress && productStatus ? (
        <div className="space-y-3 border-4 border-black bg-background p-3">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide">
              <div className="h-3 w-3 animate-spin rounded-full border-2 border-black border-t-transparent" />
              {productStatus.message ?? "Working..."}
            </div>
            <div className="font-mono text-sm font-bold tabular-nums">
              {formatElapsedTime(elapsedTime)}
            </div>
          </div>
          <div className="space-y-1">
            <div className="relative h-4 overflow-hidden border-2 border-black bg-white">
              <div
                className="h-full bg-black transition-all duration-300"
                style={{ width: `${Math.min(productStatus.progress || 0, 100)}%` }}
              />
            </div>
            <div className="text-right font-mono text-xs font-bold tabular-nums">
              {Math.min(productStatus.progress || 0, 100)}%
            </div>
          </div>
        </div>
      ) : null}

      <div className="space-y-2">
        <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Action
        </label>
        <select
          value={action}
          onChange={(event) => setAction(event.target.value as ProductActionType)}
          className="w-full border-2 border-black bg-background px-3 py-2 text-sm"
          disabled={isBusy}
        >
          {AVAILABLE_ACTIONS.map((value) => (
            <option key={value} value={value}>
              {ACTION_LABELS[value]}
            </option>
          ))}
        </select>
      </div>

      {action === "choose_concept" && productState?.concept_directions.length ? (
        <div className="space-y-2">
          <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Concept
          </label>
          <select
            value={selectedConceptId || productState.selected_concept_id || ""}
            onChange={(event) => setSelectedConceptId(event.target.value)}
            className="w-full border-2 border-black bg-background px-3 py-2 text-sm"
            disabled={isBusy}
          >
            {productState.concept_directions.map((concept) => (
              <option key={concept.concept_id} value={concept.concept_id}>
                {concept.title}
              </option>
            ))}
          </select>
        </div>
      ) : null}

      {action === "edit_region" && availableRegions.length ? (
        <div className="space-y-2">
          <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Region
          </label>
          <select
            value={selectedRegionId}
            onChange={(event) => setSelectedRegionId(event.target.value)}
            className="w-full border-2 border-black bg-background px-3 py-2 text-sm"
            disabled={isBusy}
          >
            {availableRegions.map((region) => (
              <option key={region.region_id} value={region.region_id}>
                {region.label}
              </option>
            ))}
          </select>
        </div>
      ) : null}

      {action === "recover_prior_result" && availableVersions.length ? (
        <div className="space-y-2">
          <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Saved Version
          </label>
          <select
            value={selectedVersionId}
            onChange={(event) => setSelectedVersionId(event.target.value)}
            className="w-full border-2 border-black bg-background px-3 py-2 text-sm"
            disabled={isBusy}
          >
            <option value="" disabled>
              Select a recoverable version
            </option>
            {availableVersions
              .filter((version) => version.version_id !== productState?.active_version_id)
              .map((version) => (
                <option key={version.version_id} value={version.version_id}>
                  {version.summary_of_changes}
                </option>
              ))}
          </select>
        </div>
      ) : null}

      {action === "rewind_version" && availableIterations.length > 1 ? (
        <div className="space-y-2">
          <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Iteration
          </label>
          <select
            value={selectedIterationIndex}
            onChange={(event) => setSelectedIterationIndex(event.target.value)}
            className="w-full border-2 border-black bg-background px-3 py-2 text-sm"
            disabled={isBusy}
          >
            {availableIterations.map((iteration, index) => (
              <option key={`${iteration.id}-${index}`} value={index}>
                {iteration.type}: {iteration.prompt}
              </option>
            ))}
          </select>
        </div>
      ) : null}

      <div className="space-y-2">
        <Textarea
          placeholder={getActionPlaceholder(action)}
          value={prompt}
          onChange={(event) => setPrompt(event.target.value)}
          disabled={isBusy || !isPromptRequired(action)}
          className="min-h-[88px] resize-none text-sm"
        />
        <Button onClick={() => void handleSubmit()} disabled={!canSubmit} className="w-full">
          {isBusy ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Processing...
            </>
          ) : (
            ACTION_LABELS[action]
          )}
        </Button>
      </div>

      {suggestions.length ? (
        <div className="space-y-2">
          <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Quick Starts
          </div>
          <div className="flex flex-wrap gap-2">
            {suggestions.map((suggestion) => (
              <button
                key={suggestion}
                type="button"
                onClick={() => setPrompt(suggestion)}
                disabled={isBusy}
                className="rounded-full border-2 border-black bg-secondary px-3 py-1.5 text-xs hover:bg-secondary/80 disabled:opacity-50"
              >
                {suggestion}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      <div className="grid grid-cols-2 gap-2 text-xs">
        <Button
          variant="outline"
          disabled={isBusy || !productState?.selected_concept_id}
          onClick={() => setAction("choose_concept")}
        >
          <Sparkles className="mr-2 h-3.5 w-3.5" />
          Concept
        </Button>
        <Button
          variant="outline"
          disabled={isBusy || !productState?.selected_concept_id}
          onClick={() => setAction("generate_3d_draft")}
        >
          <Wand2 className="mr-2 h-3.5 w-3.5" />
          Base 3D
        </Button>
        <Button
          variant="outline"
          disabled={isBusy || !productState?.active_version_id}
          onClick={() => setAction("edit_whole_product")}
        >
          <Sparkles className="mr-2 h-3.5 w-3.5" />
          Whole Edit
        </Button>
        <Button
          variant="outline"
          disabled={isBusy || availableIterations.length <= 1}
          onClick={() => setAction("rewind_version")}
        >
          <RotateCcw className="mr-2 h-3.5 w-3.5" />
          Rewind
        </Button>
      </div>
    </div>
  );
}
