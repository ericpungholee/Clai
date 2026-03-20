"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Loader2 } from "lucide-react";
import { AIChatPanel } from "@/components/AIChatPanel";
import ModelViewer, { type ModelViewerRef } from "@/components/ModelViewer";
import { Button } from "@/components/ui/button";
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
  selectProductConcept,
} from "@/lib/product-api";
import type { ProductState, ProductStatus } from "@/lib/product-types";
import { useLoading } from "@/providers/LoadingProvider";

type ProductWorkspaceStage = "empty" | "loading" | "editor" | "error";
const PRODUCT_POLL_INTERVAL_MS = 1500;

function hasProductModel(state: ProductState | null): boolean {
  return Boolean(
    state?.current_model_asset_url ??
      state?.editor_state.current_model_url ??
      state?.trellis_output?.model_file ??
      state?.active_version_id,
  );
}

function deriveWorkspaceStage(state: ProductState | null): ProductWorkspaceStage {
  if (!state) {
    return "loading";
  }

  if (state.workflow_stage === "error" || state.status === "error") {
    return "error";
  }

  if (hasProductModel(state)) {
    return "editor";
  }

  if (state.in_progress || state.prompt || state.concept_directions.length) {
    return "loading";
  }

  return "empty";
}

function getWorkspaceLabel(state: ProductState | null): string {
  if (hasProductModel(state)) {
    return "Updating";
  }

  if (state?.prompt || state?.in_progress) {
    return "Generating";
  }

  return "Loading";
}

export default function ProductPage() {
  const router = useRouter();
  const { stopLoading } = useLoading();

  const [productState, setProductState] = useState<ProductState | null>(null);
  const [productStatus, setProductStatus] = useState<ProductStatus | null>(null);
  const [currentProject, setCurrentProject] = useState<SavedProjectSummary | null>(null);
  const [currentModelUrl, setCurrentModelUrl] = useState<string>();
  const [isSavingProject, setIsSavingProject] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);

  const latestAssetKeyRef = useRef<string | null>(null);
  const legacyDraftUpgradeRef = useRef(false);
  const saveMessageTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const viewerRef = useRef<ModelViewerRef>(null);

  const workspaceStage = deriveWorkspaceStage(productState);
  const progressValue = Math.min(productStatus?.progress || 0, 100);
  const projectTitle =
    currentProject?.name ??
    productState?.design_brief?.product_name ??
    productState?.prompt ??
    "Product Workspace";

  const applyModelUrl = useCallback((url?: string, assetKey?: string) => {
    if (!url || !assetKey) {
      return;
    }

    setCurrentModelUrl(url);
    latestAssetKeyRef.current = assetKey;
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

  const hydrateWorkspace = useCallback(
    async (options?: { includeProject?: boolean }) => {
      const includeProject = options?.includeProject ?? true;
      const [state, status, project] = await Promise.all([
        getProductState(),
        getProductStatus(),
        includeProject ? getCurrentProject().catch(() => null) : Promise.resolve(null),
      ]);

      setProductState(state);
      setProductStatus(status);
      if (project) {
        setCurrentProject(project);
      }

      const remoteModelUrl =
        state.current_model_asset_url ??
        state.editor_state.current_model_url ??
        state.trellis_output?.model_file;
      const assetKey =
        state.active_version_id ?? state.iterations.at(-1)?.id ?? remoteModelUrl ?? "";

      if (!remoteModelUrl || !assetKey) {
        setCurrentModelUrl(undefined);
        latestAssetKeyRef.current = null;
        return;
      }

      if (latestAssetKeyRef.current === assetKey && currentModelUrl) {
        return;
      }

      await loadModel(assetKey, remoteModelUrl);
    },
    [currentModelUrl, loadModel],
  );

  useEffect(() => {
    void hydrateWorkspace()
      .catch((error) => {
        console.error("Failed to hydrate product workspace:", error);
      })
      .finally(stopLoading);
  }, [hydrateWorkspace, stopLoading]);

  useEffect(() => {
    void updateCurrentProjectContext("/product")
      .then((project) => {
        if (project) {
          setCurrentProject(project);
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!productState?.in_progress) {
      return;
    }

    const intervalId = setInterval(() => {
      void hydrateWorkspace({ includeProject: false }).catch((error) => {
        console.error("Failed to refresh product workspace:", error);
      });
    }, PRODUCT_POLL_INTERVAL_MS);

    return () => clearInterval(intervalId);
  }, [hydrateWorkspace, productState?.in_progress]);

  useEffect(() => {
    return () => {
      if (saveMessageTimeoutRef.current) {
        clearTimeout(saveMessageTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (
      legacyDraftUpgradeRef.current ||
      !productState ||
      productState.in_progress ||
      hasProductModel(productState) ||
      productState.workflow_stage === "error" ||
      !productState.concept_directions.length
    ) {
      return;
    }

    legacyDraftUpgradeRef.current = true;

    const upgradeLegacyConceptProject = async () => {
      const conceptId =
        productState.selected_concept_id ?? productState.concept_directions[0]?.concept_id;

      if (!conceptId) {
        return;
      }

      if (!productState.selected_concept_id) {
        await selectProductConcept(conceptId);
      }

      await generateProductDraft();
      await hydrateWorkspace();
    };

    void upgradeLegacyConceptProject().catch((error) => {
      console.error("Failed to upgrade legacy concept-only product:", error);
      legacyDraftUpgradeRef.current = false;
    });
  }, [hydrateWorkspace, productState]);

  const handleSaveProject = useCallback(async () => {
    try {
      setIsSavingProject(true);
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
  }, []);

  if (workspaceStage === "error") {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 px-4">
        <div className="flex h-14 w-14 items-center justify-center rounded-full border-2 border-black bg-red-100">
          <AlertTriangle className="h-6 w-6 text-red-600" />
        </div>
        <p className="max-w-md text-center text-sm text-muted-foreground">
          {productState?.last_error ?? productState?.message ?? "Generation failed."}
        </p>
        <div className="flex gap-3">
          <Button variant="outline" onClick={() => router.push("/")}>
            Go Home
          </Button>
          <Button onClick={() => void hydrateWorkspace()}>Retry</Button>
        </div>
      </div>
    );
  }

  if (workspaceStage === "empty") {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 px-4">
        <h2 className="text-2xl font-semibold">No product</h2>
        <Button variant="outline" onClick={() => router.push("/")}>
          Go Home
        </Button>
      </div>
    );
  }

  if (workspaceStage === "loading") {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 px-4">
        <Loader2 className="h-10 w-10 animate-spin" />
        <div className="text-sm font-medium">{getWorkspaceLabel(productState)}</div>
        <div className="w-full max-w-xs space-y-2">
          <div className="h-2 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-foreground transition-all duration-300"
              style={{ width: `${progressValue}%` }}
            />
          </div>
          <div className="text-center text-xs text-muted-foreground">{progressValue}%</div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="flex shrink-0 items-center justify-between border-b border-border bg-card px-4 py-3">
        <div className="text-sm font-semibold">{projectTitle}</div>
        <div className="flex items-center gap-2">
          {saveMessage ? (
            <span className="text-xs text-muted-foreground">{saveMessage}</span>
          ) : null}
          <Button
            size="sm"
            variant="outline"
            disabled={Boolean(productState?.in_progress || isSavingProject)}
            onClick={() => void handleSaveProject()}
          >
            {isSavingProject ? "Saving..." : "Save"}
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={!currentModelUrl || Boolean(productState?.in_progress)}
            onClick={() => router.push("/packaging")}
          >
            Packaging
          </Button>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 overflow-hidden">
        <div className="relative min-h-0 flex-1 overflow-hidden bg-muted/30">
          {currentModelUrl ? (
            <ModelViewer
              ref={viewerRef}
              modelUrl={currentModelUrl}
              autoRotate={false}
              interactionMode="view"
              showHandles={false}
            />
          ) : (
            <div className="flex h-full items-center justify-center">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          )}

          {productState?.in_progress ? (
            <div className="absolute right-6 top-6">
              <div className="flex items-center gap-2 rounded-full border border-border bg-card/95 px-3 py-2 text-sm shadow-lg backdrop-blur-sm">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>{getWorkspaceLabel(productState)}</span>
                <span className="text-xs text-muted-foreground">{progressValue}%</span>
              </div>
            </div>
          ) : null}
        </div>

        <aside className="flex w-[380px] shrink-0 flex-col overflow-hidden border-l border-border bg-card">
          <div className="border-b border-border px-4 py-3 text-sm font-semibold">Chat</div>
          <div className="min-h-0 flex-1 overflow-y-auto p-4">
            <AIChatPanel
              productState={productState}
              productStatus={productStatus}
              onStateRefresh={hydrateWorkspace}
            />
          </div>
        </aside>
      </div>
    </div>
  );
}
