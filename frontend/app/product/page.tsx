"use client";

import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  Boxes,
  Download,
  Eye,
  EyeOff,
  Move3d,
  Pause,
  Play,
  RotateCw,
  Settings,
  Sparkles,
  Sun,
  Wand2,
  Warehouse,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { AIChatPanel } from "@/components/AIChatPanel";
import ModelViewer, {
  type ModelTransformState,
  type ModelViewerRef,
} from "@/components/ModelViewer";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { getCachedModelUrl } from "@/lib/model-cache";
import {
  getCurrentProject,
  saveCurrentProject,
  updateCurrentProjectContext,
} from "@/lib/project-api";
import type { SavedProjectSummary } from "@/lib/project-types";
import {
  generateProductDraft,
  getProductState,
  getProductStatus,
  recoverProductVersion,
  selectProductConcept,
  updateProductEditorState,
} from "@/lib/product-api";
import {
  type ConceptDirection,
  type DesignVersion,
  type EditorTool,
  type ProductState,
  type ProductStatus,
} from "@/lib/product-types";
import { useLoading } from "@/providers/LoadingProvider";

type LightingMode = "studio" | "sunset" | "warehouse" | "forest";
type DisplayMode = "solid" | "wireframe";
type ProductWorkspaceStage =
  | "brief"
  | "concepts"
  | "3d-generation"
  | "editor"
  | "error";

const DEFAULT_TRANSFORM: ModelTransformState = {
  position: [0, 0, 0],
  rotation: [0, 0, 0],
  scale: [1, 1, 1],
};

function cloneTransformState(
  transform: ModelTransformState = DEFAULT_TRANSFORM,
): ModelTransformState {
  return {
    position: [...transform.position] as [number, number, number],
    rotation: [...transform.rotation] as [number, number, number],
    scale: [...transform.scale] as [number, number, number],
  };
}

function isSameTransform(
  left: ModelTransformState,
  right: ModelTransformState,
): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function formatStageLabel(stage: string) {
  return stage.replace(/[-_]/g, " ");
}

function formatOperationType(value?: string) {
  return (value ?? "idle").replace(/[-_]/g, " ");
}

function formatTransform(values: [number, number, number], digits = 2) {
  return values.map((value) => value.toFixed(digits)).join(" / ");
}

function deriveWorkspaceStage(
  state: ProductState | null,
  status: ProductStatus | null,
): ProductWorkspaceStage {
  if (!state) {
    return "brief";
  }

  if (state.workflow_stage === "error" || state.status === "error") {
    return "error";
  }

  const hasEditorModel = Boolean(
    state.current_model_asset_url ??
      state.editor_state.current_model_url ??
      state.trellis_output?.model_file,
  );

  if (state.in_progress) {
    if (status?.active_operation_type === "generate_3d_draft") {
      return "3d-generation";
    }
    if (
      status?.active_operation_type === "edit_whole_product" ||
      status?.active_operation_type === "edit_region" ||
      status?.active_operation_type === "restyle_materials"
    ) {
      return "editor";
    }
    if (
      status?.active_operation_type === "create_brief" ||
      status?.active_operation_type === "generate_concepts" ||
      status?.active_operation_type === "refine_concepts" ||
      status?.active_operation_type === "choose_concept"
    ) {
      return state.concept_directions.length ? "concepts" : "brief";
    }
  }

  if (
    hasEditorModel ||
    state.workflow_stage === "draft_ready" ||
    state.workflow_stage === "editing"
  ) {
    return "editor";
  }

  if (state.workflow_stage === "concepts_ready" || state.concept_directions.length) {
    return "concepts";
  }

  return "brief";
}

function getActiveVersion(state: ProductState | null): DesignVersion | null {
  if (!state?.active_version_id) {
    return null;
  }

  return (
    state.version_history.find((version) => version.version_id === state.active_version_id) ??
    null
  );
}

function getSelectedConcept(state: ProductState | null): ConceptDirection | null {
  if (!state?.selected_concept_id) {
    return null;
  }

  return (
    state.concept_directions.find(
      (concept) => concept.concept_id === state.selected_concept_id,
    ) ?? null
  );
}

function PanelCard({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
}) {
  return (
    <section className="border-2 border-black bg-background shadow-[4px_4px_0_rgba(0,0,0,1)]">
      <div className="border-b-2 border-black px-4 py-3">
        <div className="text-sm font-semibold">{title}</div>
        {subtitle ? (
          <div className="mt-1 text-[11px] uppercase tracking-wide text-muted-foreground">
            {subtitle}
          </div>
        ) : null}
      </div>
      <div className="p-4">{children}</div>
    </section>
  );
}

function ProductPage() {
  const router = useRouter();
  const { stopLoading } = useLoading();

  const [productState, setProductState] = useState<ProductState | null>(null);
  const [productStatus, setProductStatus] = useState<ProductStatus | null>(null);
  const [currentModelUrl, setCurrentModelUrl] = useState<string>();
  const [modelKey, setModelKey] = useState("");
  const [lightingMode, setLightingMode] = useState<LightingMode>("studio");
  const [displayMode, setDisplayMode] = useState<DisplayMode>("solid");
  const [zoomAction, setZoomAction] = useState<"in" | "out" | null>(null);
  const [autoRotate, setAutoRotate] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [actionInFlight, setActionInFlight] = useState<string | null>(null);
  const [editorTool, setEditorTool] = useState<EditorTool>("resize");
  const [modelTransform, setModelTransform] = useState<ModelTransformState>(DEFAULT_TRANSFORM);
  const [currentProject, setCurrentProject] = useState<SavedProjectSummary | null>(null);
  const [isSavingProject, setIsSavingProject] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);

  const latestAssetKeyRef = useRef<string | null>(null);
  const viewerRef = useRef<ModelViewerRef>(null);
  const editorPersistTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveMessageTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastPersistedEditorRef = useRef<{
    activeTool: EditorTool;
    transform: ModelTransformState;
  }>({
    activeTool: "resize",
    transform: cloneTransformState(DEFAULT_TRANSFORM),
  });

  const workspaceStage = deriveWorkspaceStage(productState, productStatus);
  const selectedConcept = getSelectedConcept(productState);
  const activeVersion = getActiveVersion(productState);
  const concepts = productState?.concept_directions ?? [];
  const previewImage =
    productStatus?.preview_image ??
    productState?.trellis_output?.no_background_images?.[0] ??
    productState?.images?.[0] ??
    null;
  const projectTitle =
    currentProject?.name ??
    productState?.design_brief?.product_name ??
    productState?.prompt ??
    "Unsaved project";

  const applyModelUrl = useCallback((url?: string, assetKey?: string) => {
    if (!url || !assetKey) {
      return;
    }

    setCurrentModelUrl(url);
    latestAssetKeyRef.current = assetKey;
    setModelKey(assetKey);
  }, []);

  const loadModel = useCallback(
    async (assetKey: string, remoteModelUrl: string) => {
      try {
        const cachedUrl = await getCachedModelUrl(assetKey, remoteModelUrl);
        applyModelUrl(cachedUrl, assetKey);
      } catch {
        applyModelUrl(remoteModelUrl, assetKey);
      }
    },
    [applyModelUrl],
  );

  const hydrateWorkspace = useCallback(async () => {
    const [state, status, project] = await Promise.all([
      getProductState(),
      getProductStatus(),
      getCurrentProject(),
    ]);
    setProductState(state);
    setProductStatus(status);
    setCurrentProject(project);
    setEditorTool(state.editor_state.active_tool ?? "resize");
    setModelTransform(state.editor_state.transform ?? DEFAULT_TRANSFORM);
    lastPersistedEditorRef.current = {
      activeTool: state.editor_state.active_tool ?? "resize",
      transform: cloneTransformState(state.editor_state.transform ?? DEFAULT_TRANSFORM),
    };

    const remoteModelUrl =
      state.current_model_asset_url ??
      state.editor_state.current_model_url ??
      state.trellis_output?.model_file;
    const assetKey =
      state.active_version_id ?? state.iterations.at(-1)?.id ?? remoteModelUrl ?? "";

    if (!remoteModelUrl || !assetKey) {
      setCurrentModelUrl(undefined);
      setModelKey("");
      latestAssetKeyRef.current = null;
      return;
    }

    if (latestAssetKeyRef.current === assetKey && currentModelUrl) {
      return;
    }

    await loadModel(assetKey, remoteModelUrl);
  }, [currentModelUrl, loadModel]);

  useEffect(() => {
    void hydrateWorkspace().finally(stopLoading);
  }, [hydrateWorkspace, stopLoading]);

  useEffect(() => {
    void updateCurrentProjectContext("/product")
      .then((project) => {
        if (project) {
          setCurrentProject(project);
        }
      })
      .catch(() => {
        // No active project yet; saving can create one later.
      });
  }, []);

  useEffect(() => {
    if (!productState?.in_progress) {
      return;
    }

    const intervalId = setInterval(() => {
      void hydrateWorkspace();
    }, 3000);

    return () => clearInterval(intervalId);
  }, [hydrateWorkspace, productState?.in_progress]);

  useEffect(() => {
    if (!zoomAction) {
      return;
    }

    const timeoutId = setTimeout(() => setZoomAction(null), 200);
    return () => clearTimeout(timeoutId);
  }, [zoomAction]);

  useEffect(() => {
    if (workspaceStage === "editor" && currentModelUrl) {
      setAutoRotate(false);
    }
  }, [currentModelUrl, workspaceStage]);

  useEffect(() => {
    return () => {
      if (saveMessageTimeoutRef.current) {
        clearTimeout(saveMessageTimeoutRef.current);
      }
      if (editorPersistTimeoutRef.current) {
        clearTimeout(editorPersistTimeoutRef.current);
      }
    };
  }, []);

  const persistEditorState = useCallback(
    async (force: boolean = false) => {
      if (!currentModelUrl || !productState || productState.in_progress) {
        return;
      }

      const nextTransform = cloneTransformState(modelTransform);
      const currentPersisted = lastPersistedEditorRef.current;
      if (
        !force &&
        currentPersisted.activeTool === editorTool &&
        isSameTransform(currentPersisted.transform, nextTransform)
      ) {
        return;
      }

      await updateProductEditorState({
        interactionMode: "direct_edit",
        handlesVisible: true,
        activeTool: editorTool,
        transform: nextTransform,
      });

      lastPersistedEditorRef.current = {
        activeTool: editorTool,
        transform: nextTransform,
      };
    },
    [currentModelUrl, editorTool, modelTransform, productState],
  );

  useEffect(() => {
    if (!currentModelUrl || !productState || productState.in_progress) {
      return;
    }

    const persisted = lastPersistedEditorRef.current;
    if (
      persisted.activeTool === editorTool &&
      isSameTransform(persisted.transform, modelTransform)
    ) {
      return;
    }

    if (editorPersistTimeoutRef.current) {
      clearTimeout(editorPersistTimeoutRef.current);
    }

    editorPersistTimeoutRef.current = setTimeout(() => {
      void persistEditorState();
    }, 500);

    return () => {
      if (editorPersistTimeoutRef.current) {
        clearTimeout(editorPersistTimeoutRef.current);
      }
    };
  }, [currentModelUrl, editorTool, modelTransform, persistEditorState, productState]);

  const handleSaveProject = useCallback(async () => {
    try {
      setIsSavingProject(true);
      await persistEditorState(true);
      const savedProject = await saveCurrentProject({ lastRoute: "/product" });
      setCurrentProject(savedProject);
      setSaveMessage(`Saved ${new Date().toLocaleTimeString()}`);
      if (saveMessageTimeoutRef.current) {
        clearTimeout(saveMessageTimeoutRef.current);
      }
      saveMessageTimeoutRef.current = setTimeout(() => {
        setSaveMessage(null);
      }, 3000);
    } catch (error) {
      alert(error instanceof Error ? error.message : "Failed to save project.");
    } finally {
      setIsSavingProject(false);
    }
  }, [persistEditorState]);

  const handleDownloadScreenshot = useCallback(async () => {
    if (!viewerRef.current || isDownloading || !currentModelUrl) {
      return;
    }

    try {
      setIsDownloading(true);
      const dataUrl = await viewerRef.current.captureScreenshot();
      const link = document.createElement("a");
      link.href = dataUrl;
      link.download = `product-${Date.now()}.jpg`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch {
      alert("Failed to capture screenshot. Please try again.");
    } finally {
      setIsDownloading(false);
    }
  }, [currentModelUrl, isDownloading]);

  const handleSelectConcept = useCallback(
    async (conceptId: string) => {
      try {
        setActionInFlight(`concept-${conceptId}`);
        await selectProductConcept(conceptId);
        await hydrateWorkspace();

        setActionInFlight(`draft-${conceptId}`);
        await generateProductDraft();
        await hydrateWorkspace();
      } catch (error) {
        alert(
          error instanceof Error
            ? error.message
            : "Failed to generate a base 3D model from the selected concept.",
        );
      } finally {
        setActionInFlight(null);
      }
    },
    [hydrateWorkspace],
  );

  const handleRecoverVersion = useCallback(
    async (versionId: string) => {
      try {
        setActionInFlight(`recover-${versionId}`);
        await recoverProductVersion(versionId);
        await hydrateWorkspace();
      } catch (error) {
        alert(error instanceof Error ? error.message : "Failed to recover version.");
      } finally {
        setActionInFlight(null);
      }
    },
    [hydrateWorkspace],
  );

  const stageSummary = useMemo(() => {
    switch (workspaceStage) {
      case "brief":
        return "Turn the prompt into four concept images.";
      case "concepts":
        return "Choose one concept. That single concept becomes the only base for 3D.";
      case "3d-generation":
        return "Generating a base 3D draft from the selected concept.";
      case "editor":
        return "Resize handles are live. Refine the generated draft directly.";
      case "error":
        return "The workflow failed, but prior artifacts remain available.";
    }
  }, [workspaceStage]);

  const canOpenFinalActions = Boolean(currentModelUrl && !productState?.in_progress);

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-background">
      <div className="border-b-2 border-black bg-card px-4 py-3">
        <div className="flex flex-col gap-2 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <div className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
              Product Workspace
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center rounded-full border-2 border-black bg-yellow-200 px-3 py-1 text-xs font-semibold uppercase tracking-wide">
                {formatStageLabel(workspaceStage)}
              </span>
              {productState?.in_progress ? (
                <span className="text-xs font-medium text-muted-foreground">
                  {productStatus?.message ?? productState.message ?? "Working..."}{" "}
                  {productStatus?.progress ? `(${productStatus.progress}%)` : ""}
                </span>
              ) : (
                <span className="text-xs font-medium text-muted-foreground">
                  {stageSummary}
                </span>
              )}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="rounded-full border border-black bg-secondary px-3 py-1 text-[11px] font-semibold uppercase tracking-wide">
              {projectTitle}
            </div>
            <div className="text-xs text-muted-foreground">
              Current operation: {formatOperationType(productStatus?.active_operation_type)}
            </div>
            <Button
              size="sm"
              variant="outline"
              disabled={Boolean(productState?.in_progress || isSavingProject)}
              onClick={() => void handleSaveProject()}
            >
              {isSavingProject ? "Saving..." : "Save Project"}
            </Button>
            {saveMessage ? (
              <div className="text-xs text-muted-foreground">{saveMessage}</div>
            ) : null}
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-hidden xl:flex">
        <aside className="w-full shrink-0 overflow-y-auto border-b-2 border-black bg-card p-4 xl:w-[360px] xl:border-b-0 xl:border-r-2">
          <div className="space-y-4">
            <PanelCard
              title="Design Brief"
              subtitle={productState?.design_brief?.category ?? "Pending"}
            >
              {productState?.design_brief ? (
                <div className="space-y-3 text-sm">
                  <div>
                    <div className="font-semibold">{productState.design_brief.product_name}</div>
                    <div className="text-xs text-muted-foreground">
                      {productState.design_brief.primary_use_case}
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {productState.design_brief.style_keywords.map((keyword) => (
                      <span
                        key={keyword}
                        className="rounded-full border border-black bg-secondary px-2 py-1 text-[11px] uppercase tracking-wide"
                      >
                        {keyword}
                      </span>
                    ))}
                  </div>
                  <div className="space-y-1 text-xs text-muted-foreground">
                    <div>Target user: {productState.design_brief.target_user}</div>
                    <div>Materials: {productState.design_brief.materials.join(", ")}</div>
                  </div>
                </div>
              ) : (
                <div className="text-sm text-muted-foreground">
                  A structured brief will appear here once the workflow starts.
                </div>
              )}
            </PanelCard>

            <PanelCard
              title="Version History"
              subtitle={`${productState?.version_history.length ?? 0} saved`}
            >
              <div className="space-y-2">
                {productState?.version_history.length ? (
                  productState.version_history
                    .slice()
                    .reverse()
                    .map((version) => {
                      const isActive = version.version_id === productState.active_version_id;
                      return (
                        <div
                          key={version.version_id}
                          className={`border-2 p-3 text-xs ${
                            isActive ? "border-black bg-green-100" : "border-black/70 bg-muted"
                          }`}
                        >
                          <div className="font-semibold">{version.summary_of_changes}</div>
                          <div className="mt-1 text-muted-foreground">
                            {new Date(version.created_at).toLocaleString()}
                          </div>
                          <Button
                            size="sm"
                            variant="outline"
                            className="mt-3 w-full"
                            disabled={isActive || productState.in_progress}
                            onClick={() => void handleRecoverVersion(version.version_id)}
                          >
                            Recover Version
                          </Button>
                        </div>
                      );
                    })
                ) : (
                  <div className="text-sm text-muted-foreground">
                    Versions appear after the selected concept becomes a base 3D draft.
                  </div>
                )}
              </div>
            </PanelCard>

            <PanelCard
              title="AI Operations"
              subtitle={`${productState?.ai_operations.length ?? 0} logged`}
            >
              <div className="space-y-2 text-xs">
                {productState?.ai_operations.length ? (
                  productState.ai_operations
                    .slice()
                    .reverse()
                    .map((operation) => (
                      <div key={operation.operation_id} className="border border-black/70 p-2">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-semibold">
                            {formatOperationType(operation.type)}
                          </span>
                          <span className="uppercase text-muted-foreground">
                            {operation.status}
                          </span>
                        </div>
                        {operation.summary ? (
                          <div className="mt-1 text-muted-foreground">
                            {operation.summary}
                          </div>
                        ) : null}
                      </div>
                    ))
                ) : (
                  <div className="text-sm text-muted-foreground">
                    Structured operations will be logged here.
                  </div>
                )}
              </div>
            </PanelCard>
          </div>
        </aside>

        <main className="flex min-h-0 flex-1 flex-col bg-muted/30">
          <div className="relative flex-1 overflow-hidden">
            {currentModelUrl ? (
              <ModelViewer
                ref={viewerRef}
                key={modelKey}
                modelUrl={currentModelUrl}
                lightingMode={lightingMode}
                wireframe={displayMode === "wireframe"}
                zoomAction={zoomAction}
                autoRotate={autoRotate && workspaceStage !== "editor"}
                interactionMode={productState?.editor_state.interaction_mode ?? "view"}
                activeTool={editorTool}
                showHandles={Boolean(productState?.editor_state.handles_visible)}
                initialTransform={productState?.editor_state.transform ?? DEFAULT_TRANSFORM}
                onTransformChange={setModelTransform}
              />
            ) : workspaceStage === "3d-generation" && selectedConcept ? (
              <div className="flex h-full items-center justify-center p-6">
                <div className="grid max-w-5xl gap-6 border-2 border-black bg-background p-6 shadow-[6px_6px_0_rgba(0,0,0,1)] lg:grid-cols-[1.1fr_0.9fr]">
                  <div className="space-y-4">
                    <div className="inline-flex items-center gap-2 rounded-full border-2 border-black bg-yellow-200 px-3 py-1 text-xs font-semibold uppercase tracking-wide">
                      <Wand2 className="h-4 w-4" />
                      Generating Base 3D
                    </div>
                    <div className="text-2xl font-semibold">{selectedConcept.title}</div>
                    <div className="text-sm text-muted-foreground">
                      Using only the selected concept image as the starting point for the 3D
                      base. The editor will open with resize handles active as soon as the draft
                      is ready.
                    </div>
                    <div className="space-y-2 border-2 border-black bg-muted p-4 text-sm">
                      <div className="font-semibold">What happens next</div>
                      <div className="text-muted-foreground">
                        1. Build the base 3D from the selected concept.
                      </div>
                      <div className="text-muted-foreground">
                        2. Open the editor immediately in direct-edit mode.
                      </div>
                      <div className="text-muted-foreground">
                        3. Let you resize, stretch, scale, move, and rotate the draft.
                      </div>
                    </div>
                  </div>
                  <div className="space-y-3">
                    <div className="aspect-[4/3] overflow-hidden border-2 border-black bg-muted">
                      {selectedConcept.concept_image_url ? (
                        <img
                          src={selectedConcept.concept_image_url}
                          alt={selectedConcept.title}
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                          Concept preview unavailable
                        </div>
                      )}
                    </div>
                    <div className="border-2 border-black bg-secondary p-3 text-xs uppercase tracking-wide text-muted-foreground">
                      {productStatus?.message ?? "Building base 3D draft"}
                    </div>
                  </div>
                </div>
              </div>
            ) : concepts.length ? (
              <div className="h-full overflow-y-auto p-6">
                <div className="mx-auto max-w-6xl space-y-6">
                  <div className="max-w-3xl">
                    <div className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground">
                      Step 1 of 3
                    </div>
                    <div className="mt-2 text-3xl font-semibold">Choose one concept image</div>
                    <div className="mt-2 text-sm text-muted-foreground">
                      Gemini has generated four directions. Pick one to use as the only input for
                      base 3D generation.
                    </div>
                  </div>

                  <div className="grid gap-5 lg:grid-cols-2">
                    {concepts.map((concept, index) => {
                      const isSelected = concept.concept_id === productState?.selected_concept_id;
                      const isWorking =
                        actionInFlight === `concept-${concept.concept_id}` ||
                        actionInFlight === `draft-${concept.concept_id}`;

                      return (
                        <article
                          key={concept.concept_id}
                          className={`border-2 border-black bg-background shadow-[4px_4px_0_rgba(0,0,0,1)] ${
                            isSelected ? "ring-4 ring-yellow-300" : ""
                          }`}
                        >
                          <div className="aspect-[4/3] overflow-hidden border-b-2 border-black bg-muted">
                            {concept.concept_image_url ? (
                              <img
                                src={concept.concept_image_url}
                                alt={concept.title}
                                className="h-full w-full object-cover"
                              />
                            ) : (
                              <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                                Concept image unavailable
                              </div>
                            )}
                          </div>
                          <div className="space-y-4 p-4">
                            <div className="flex items-start justify-between gap-3">
                              <div>
                                <div className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground">
                                  Option {index + 1}
                                </div>
                                <div className="mt-1 text-lg font-semibold">{concept.title}</div>
                              </div>
                              <div className="rounded-full border border-black bg-secondary px-2 py-1 text-[11px] uppercase tracking-wide">
                                {Math.round(concept.confidence * 100)}% fit
                              </div>
                            </div>

                            <div className="text-sm text-muted-foreground">{concept.summary}</div>

                            <div className="space-y-1 text-xs text-muted-foreground">
                              <div>Silhouette: {concept.silhouette}</div>
                              <div>Form language: {concept.form_language}</div>
                            </div>

                            <div className="flex flex-wrap gap-2">
                              {concept.aesthetic_keywords.slice(0, 4).map((keyword) => (
                                <span
                                  key={keyword}
                                  className="rounded-full border border-black bg-secondary px-2 py-1 text-[11px] uppercase tracking-wide"
                                >
                                  {keyword}
                                </span>
                              ))}
                            </div>

                            <Button
                              className="w-full"
                              disabled={Boolean(productState?.in_progress || actionInFlight)}
                              onClick={() => void handleSelectConcept(concept.concept_id)}
                            >
                              {isWorking ? (
                                <>
                                  <div className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                                  Building Base 3D...
                                </>
                              ) : (
                                <>
                                  <Sparkles className="mr-2 h-4 w-4" />
                                  Select and Generate 3D
                                </>
                              )}
                            </Button>
                          </div>
                        </article>
                      );
                    })}
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex h-full items-center justify-center p-6">
                <div className="max-w-3xl border-2 border-black bg-background p-6 text-center shadow-[6px_6px_0_rgba(0,0,0,1)]">
                  <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full border-2 border-black bg-yellow-200">
                    {workspaceStage === "error" ? (
                      <AlertTriangle className="h-6 w-6" />
                    ) : (
                      <Boxes className="h-6 w-6" />
                    )}
                  </div>
                  <div className="text-lg font-semibold capitalize">
                    {formatStageLabel(workspaceStage)}
                  </div>
                  <div className="mt-2 text-sm text-muted-foreground">
                    {productState?.message ?? stageSummary}
                  </div>
                  {workspaceStage === "error" && productState?.last_error ? (
                    <div className="mt-4 border-2 border-red-500 bg-red-50 p-3 text-left text-sm text-red-700">
                      {productState.last_error}
                    </div>
                  ) : null}
                </div>
              </div>
            )}

            {currentModelUrl ? (
              <>
                <div className="absolute left-4 top-4 max-w-sm space-y-3">
                  <div className="border-2 border-black bg-yellow-200 px-3 py-2 text-xs font-semibold uppercase tracking-wide shadow-[4px_4px_0_rgba(0,0,0,1)]">
                    Direct Edit Active: resize handles visible
                  </div>
                  <div className="border-2 border-black bg-background p-3 shadow-[4px_4px_0_rgba(0,0,0,1)]">
                    <div className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
                      Refinement Tools
                    </div>
                    <div className="mt-3 grid grid-cols-3 gap-2">
                      {(
                        [
                          ["resize", "Resize", Wand2],
                          ["move", "Move", Move3d],
                          ["rotate", "Rotate", RotateCw],
                        ] as const
                      ).map(([tool, label, Icon]) => (
                        <Button
                          key={tool}
                          size="sm"
                          variant={editorTool === tool ? "default" : "outline"}
                          onClick={() => setEditorTool(tool)}
                        >
                          <Icon className="mr-2 h-4 w-4" />
                          {label}
                        </Button>
                      ))}
                    </div>
                    <div className="mt-3 text-xs text-muted-foreground">
                      Drag the colored handles directly on the model. Start with resize, then use
                      move or rotate to refine the generated draft.
                    </div>
                  </div>
                </div>

                <div className="absolute right-4 top-4 flex flex-col gap-2">
                  <Button
                    size="icon"
                    variant="secondary"
                    onClick={() => void handleDownloadScreenshot()}
                    disabled={isDownloading || !currentModelUrl}
                    title="Download Screenshot"
                  >
                    {isDownloading ? (
                      <div className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                    ) : (
                      <Download className="h-4 w-4" />
                    )}
                  </Button>
                  <Button size="icon" variant="secondary" onClick={() => setZoomAction("in")}>
                    <ZoomIn className="h-4 w-4" />
                  </Button>
                  <Button size="icon" variant="secondary" onClick={() => setZoomAction("out")}>
                    <ZoomOut className="h-4 w-4" />
                  </Button>
                  <Button
                    size="icon"
                    variant="secondary"
                    onClick={() => setAutoRotate((previous) => !previous)}
                  >
                    {autoRotate ? (
                      <Pause className="h-4 w-4" />
                    ) : (
                      <Play className="h-4 w-4" />
                    )}
                  </Button>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button size="icon" variant="secondary">
                        <Settings className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => setLightingMode("studio")}>
                        <Settings className="mr-2 h-4 w-4" />
                        Studio Lighting
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => setLightingMode("sunset")}>
                        <Sun className="mr-2 h-4 w-4" />
                        Sunset Lighting
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => setLightingMode("warehouse")}>
                        <Warehouse className="mr-2 h-4 w-4" />
                        Warehouse Lighting
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onClick={() => setDisplayMode("solid")}>
                        <Eye className="mr-2 h-4 w-4" />
                        Solid View
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => setDisplayMode("wireframe")}>
                        <EyeOff className="mr-2 h-4 w-4" />
                        Wireframe View
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </>
            ) : null}

            {previewImage ? (
              <div className="absolute bottom-4 left-4 w-44 border-2 border-black bg-card shadow-[4px_4px_0_rgba(0,0,0,1)]">
                <div className="border-b-2 border-black bg-black px-3 py-1 text-[10px] font-mono uppercase text-white">
                  Latest Preview
                </div>
                <div className="aspect-square overflow-hidden bg-muted">
                  <img
                    src={previewImage}
                    alt="Latest product preview"
                    className="h-full w-full object-cover"
                  />
                </div>
              </div>
            ) : null}
          </div>

          <div className="grid gap-4 border-t-2 border-black bg-card p-4 xl:grid-cols-3">
            <PanelCard
              title="Concept Board"
              subtitle={concepts.length ? `${concepts.length} selectable directions` : "No concepts yet"}
            >
              {concepts.length ? (
                <div className="grid grid-cols-2 gap-3">
                  {concepts.map((concept) => {
                    const isSelected = concept.concept_id === productState?.selected_concept_id;
                    return (
                      <div
                        key={concept.concept_id}
                        className={`space-y-2 border-2 p-2 ${
                          isSelected ? "border-black bg-yellow-100" : "border-black/70 bg-muted"
                        }`}
                      >
                        <div className="aspect-square overflow-hidden border border-black bg-background">
                          {concept.concept_image_url ? (
                            <img
                              src={concept.concept_image_url}
                              alt={concept.title}
                              className="h-full w-full object-cover"
                            />
                          ) : (
                            <div className="flex h-full items-center justify-center text-[11px] text-muted-foreground">
                              No image
                            </div>
                          )}
                        </div>
                        <div className="text-xs font-semibold">{concept.title}</div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="text-sm text-muted-foreground">
                  Concept images will appear here after the prompt is processed.
                </div>
              )}
            </PanelCard>

            <PanelCard
              title="Manual Refinement"
              subtitle={
                currentModelUrl
                  ? `Handles ${productState?.editor_state.handles_visible ? "active" : "hidden"}`
                  : "Editor locked until base 3D exists"
              }
            >
              {currentModelUrl ? (
                <div className="space-y-3 text-sm">
                  <div className="grid grid-cols-1 gap-2 text-xs text-muted-foreground">
                    <div>Active tool: {formatStageLabel(editorTool)}</div>
                    <div>Scale: {formatTransform(modelTransform.scale)}</div>
                    <div>Move: {formatTransform(modelTransform.position)}</div>
                    <div>Rotate: {formatTransform(modelTransform.rotation)}</div>
                  </div>
                  <div className="border-2 border-black bg-secondary p-3 text-xs text-muted-foreground">
                    This starts as a generated draft. Use resize handles first, then move or
                    rotate only as needed to refine proportions.
                  </div>
                </div>
              ) : (
                <div className="text-sm text-muted-foreground">
                  Once the selected concept becomes a 3D base, the editor opens directly with
                  draggable resize handles.
                </div>
              )}
            </PanelCard>

            <PanelCard title="Final Actions" subtitle="After manual refinement">
              <div className="space-y-3">
                <div className="text-sm text-muted-foreground">
                  Export the refined draft or move straight into packaging once the base model is
                  in the editor.
                </div>
                <Button
                  className="w-full"
                  disabled={!canOpenFinalActions}
                  onClick={() => router.push("/final-view")}
                >
                  Export Assets
                </Button>
                <Button
                  variant="outline"
                  className="w-full"
                  disabled={!canOpenFinalActions}
                  onClick={() => router.push("/packaging")}
                >
                  Move To Packaging
                </Button>
              </div>
            </PanelCard>
          </div>
        </main>

        <aside className="w-full shrink-0 overflow-y-auto border-t-2 border-black bg-card p-4 xl:w-[420px] xl:border-l-2 xl:border-t-0">
          <div className="space-y-4">
            <PanelCard
              title="Selected Direction"
              subtitle={
                selectedConcept
                  ? `${Math.round(selectedConcept.confidence * 100)}% confidence`
                  : "No concept selected"
              }
            >
              {selectedConcept ? (
                <div className="space-y-3 text-sm">
                  {selectedConcept.concept_image_url ? (
                    <div className="aspect-[4/3] overflow-hidden border-2 border-black bg-muted">
                      <img
                        src={selectedConcept.concept_image_url}
                        alt={selectedConcept.title}
                        className="h-full w-full object-cover"
                      />
                    </div>
                  ) : null}
                  <div className="font-semibold">{selectedConcept.title}</div>
                  <div className="text-muted-foreground">{selectedConcept.summary}</div>
                  <div className="space-y-1 text-xs text-muted-foreground">
                    <div>Silhouette: {selectedConcept.silhouette}</div>
                    <div>Form language: {selectedConcept.form_language}</div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {selectedConcept.materials.map((material) => (
                      <span
                        key={material}
                        className="rounded-full border border-black bg-secondary px-2 py-1 text-[11px]"
                      >
                        {material}
                      </span>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="text-sm text-muted-foreground">
                  Pick a concept image to trigger base 3D generation. The editor will then open
                  with resize handles already active.
                </div>
              )}
            </PanelCard>

            <PanelCard
              title="Editor Context"
              subtitle={activeVersion?.summary_of_changes ?? "No active version"}
            >
              <div className="space-y-3 text-sm">
                <div>
                  <div className="font-semibold">
                    {activeVersion?.version_id ?? "No version active"}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {activeVersion
                      ? new Date(activeVersion.created_at).toLocaleString()
                      : "Select a concept to create the base 3D draft"}
                  </div>
                </div>
                <div className="space-y-1 text-xs text-muted-foreground">
                  <div>Selected concept: {selectedConcept?.title ?? "Not selected"}</div>
                  <div>
                    Editor mode: {formatStageLabel(productState?.editor_state.interaction_mode ?? "view")}
                  </div>
                  <div>
                    Current model asset: {productState?.current_model_asset_url ? "Loaded" : "Not available"}
                  </div>
                </div>
                {productState?.named_regions.length ? (
                  <div className="flex flex-wrap gap-2">
                    {productState.named_regions.map((region) => (
                      <span
                        key={region.region_id}
                        className="rounded-full border border-black bg-secondary px-2 py-1 text-[11px]"
                      >
                        {region.label}
                      </span>
                    ))}
                  </div>
                ) : null}
              </div>
            </PanelCard>

            <PanelCard title="AI Action Panel" subtitle="Concepts first, then direct editing">
              <AIChatPanel
                productState={productState}
                productStatus={productStatus}
                onStateRefresh={hydrateWorkspace}
              />
            </PanelCard>
          </div>
        </aside>
      </div>
    </div>
  );
}

export default ProductPage;
