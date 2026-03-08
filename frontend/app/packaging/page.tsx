"use client";

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Box,
  CheckCircle2,
  CylinderIcon,
  MessageSquare,
  Pencil,
  RotateCcw,
} from "lucide-react";
import { AIChatPanel } from "@/components/AIChatPanel";
import { DielineEditor } from "@/components/dieline-editor";
import { PackageViewer3D } from "@/components/package-viewer-3d";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  getPackagingState,
  resetCurrentShape,
  updatePackagingDimensions,
} from "@/lib/packaging-api";
import {
  getCurrentProject,
  saveCurrentProject,
  updateCurrentProjectContext,
} from "@/lib/project-api";
import {
  calculatePackageSurfaceArea,
  calculatePackageVolume,
  getShapeState,
  loadCachedPanelTextures,
  normalizePackageDimensions,
  resolvePackagingModel,
} from "@/lib/packaging-helpers";
import {
  DEFAULT_PACKAGE_DIMENSIONS,
  generatePackageModel,
  updateModelFromDielines,
} from "@/lib/packaging-types";
import type {
  DielinePath,
  PackageDimensions,
  PackageModel,
  PackageType,
  PackagingState,
  PanelId,
} from "@/lib/packaging-types";
import type { SavedProjectSummary } from "@/lib/project-types";
import { clearTextureCache, getCachedTextureUrl } from "@/lib/texture-cache";
import { useLoading } from "@/providers/LoadingProvider";

type ViewMode = "2d" | "3d";

const PACKAGE_TYPES: readonly {
  type: PackageType;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}[] = [
  { type: "box", label: "Box", icon: Box },
  { type: "cylinder", label: "Cylinder", icon: CylinderIcon },
];

const TEXTURE_NOTIFICATION_TIMEOUT_MS = 3000;
const DIMENSION_SAVE_DEBOUNCE_MS = 1000;
const GENERATION_POLL_INTERVAL_MS = 1000;

const PackagingEditor = React.memo(function PackagingEditor({
  activeView,
  dimensions,
  handleDimensionChange,
  handlePackageTypeChange,
  handleResetCurrentShape,
  packageModel,
  packageType,
  setActiveView,
  surfaceArea,
  volume,
}: {
  activeView: ViewMode;
  dimensions: PackageDimensions;
  handleDimensionChange: (
    key: keyof PackageDimensions,
    value: number,
  ) => void;
  handlePackageTypeChange: (type: PackageType) => Promise<void>;
  handleResetCurrentShape: () => Promise<void>;
  packageModel: PackageModel | null;
  packageType: PackageType;
  setActiveView: (view: ViewMode) => void;
  surfaceArea: number;
  volume: number;
}) {
  return (
    <TabsContent
      value="editor"
      className="flex-1 overflow-y-auto p-4 flex flex-col space-y-4 mt-0"
    >
      <div className="space-y-2">
        <Label className="text-xs font-medium text-muted-foreground">
          View Mode
        </Label>
        <div className="flex gap-2">
          <Button
            variant={activeView === "2d" ? "default" : "outline"}
            className="flex-1"
            size="sm"
            onClick={() => setActiveView("2d")}
          >
            Dieline
          </Button>
          <Button
            variant={activeView === "3d" ? "default" : "outline"}
            className="flex-1"
            size="sm"
            onClick={() => setActiveView("3d")}
          >
            3D
          </Button>
        </div>
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <Label className="text-xs font-medium text-muted-foreground">
            Package Type
          </Label>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => void handleResetCurrentShape()}
            className="h-6 px-2 text-xs text-muted-foreground hover:text-foreground"
            title={`Reset ${packageType} to defaults`}
          >
            <RotateCcw className="w-3 h-3 mr-1" />
            Reset
          </Button>
        </div>
        <div className="grid grid-cols-2 gap-2">
          {PACKAGE_TYPES.map(({ type, label, icon: Icon }) => (
            <Button
              key={type}
              variant={packageType === type ? "default" : "outline"}
              className="flex flex-col items-center gap-1 h-auto py-3"
              size="sm"
              onClick={() => void handlePackageTypeChange(type)}
            >
              <Icon className="w-4 h-4" />
              <span className="text-xs">{label}</span>
            </Button>
          ))}
        </div>
      </div>

      <div className="border-2 border-black p-4 space-y-4">
        <h3 className="text-sm font-semibold text-foreground">Dimensions (mm)</h3>

        {packageType === "box" ? (
          <>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-xs">X</Label>
                <Input
                  type="number"
                  value={packageModel?.dimensions.width ?? dimensions.width}
                  onChange={(event) => {
                    const value = Number(event.target.value);
                    if (!Number.isNaN(value) && value >= 0) {
                      handleDimensionChange("width", value);
                    }
                  }}
                  className="w-16 h-7 text-xs"
                  min={0}
                />
              </div>
              <Slider
                value={[packageModel?.dimensions.width ?? dimensions.width]}
                onValueChange={([value]) => handleDimensionChange("width", value)}
                min={20}
                max={300}
                step={5}
                className="w-full"
              />
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-xs">Y</Label>
                <Input
                  type="number"
                  value={packageModel?.dimensions.height ?? dimensions.height}
                  onChange={(event) => {
                    const value = Number(event.target.value);
                    if (!Number.isNaN(value) && value >= 0) {
                      handleDimensionChange("height", value);
                    }
                  }}
                  className="w-16 h-7 text-xs"
                  min={0}
                />
              </div>
              <Slider
                value={[packageModel?.dimensions.height ?? dimensions.height]}
                onValueChange={([value]) => handleDimensionChange("height", value)}
                min={20}
                max={400}
                step={5}
                className="w-full"
              />
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-xs">Z</Label>
                <Input
                  type="number"
                  value={packageModel?.dimensions.depth ?? dimensions.depth}
                  onChange={(event) => {
                    const value = Number(event.target.value);
                    if (!Number.isNaN(value) && value >= 0) {
                      handleDimensionChange("depth", value);
                    }
                  }}
                  className="w-16 h-7 text-xs"
                  min={0}
                />
              </div>
              <Slider
                value={[packageModel?.dimensions.depth ?? dimensions.depth]}
                onValueChange={([value]) => handleDimensionChange("depth", value)}
                min={20}
                max={300}
                step={5}
                className="w-full"
              />
            </div>
          </>
        ) : (
          <>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-xs">Radius</Label>
                <Input
                  type="number"
                  value={(packageModel?.dimensions.width ?? dimensions.width) / 2}
                  onChange={(event) => {
                    const value = Number(event.target.value);
                    if (!Number.isNaN(value) && value >= 0) {
                      handleDimensionChange("width", value * 2);
                    }
                  }}
                  className="w-16 h-7 text-xs"
                  min={0}
                />
              </div>
              <Slider
                value={[(packageModel?.dimensions.width ?? dimensions.width) / 2]}
                onValueChange={([value]) => handleDimensionChange("width", value * 2)}
                min={10}
                max={150}
                step={5}
                className="w-full"
              />
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-xs">Height</Label>
                <Input
                  type="number"
                  value={packageModel?.dimensions.height ?? dimensions.height}
                  onChange={(event) => {
                    const value = Number(event.target.value);
                    if (!Number.isNaN(value) && value >= 0) {
                      handleDimensionChange("height", value);
                    }
                  }}
                  className="w-16 h-7 text-xs"
                  min={0}
                />
              </div>
              <Slider
                value={[packageModel?.dimensions.height ?? dimensions.height]}
                onValueChange={([value]) => handleDimensionChange("height", value)}
                min={20}
                max={400}
                step={5}
                className="w-full"
              />
            </div>
          </>
        )}
      </div>

      <div className="border-2 border-black p-4 space-y-2">
        <h3 className="text-sm font-semibold text-foreground">
          Package Information
        </h3>
        <div className="text-xs space-y-1">
          <div className="flex justify-between text-muted-foreground">
            <span>Volume:</span>
            <span className="font-medium text-foreground">{volume} mm3</span>
          </div>
          <div className="flex justify-between text-muted-foreground">
            <span>Surface Area:</span>
            <span className="font-medium text-foreground">
              {surfaceArea} mm2
            </span>
          </div>
        </div>
      </div>
    </TabsContent>
  );
});

function Packaging() {
  const { stopLoading } = useLoading();

  const [packagingState, setPackagingState] = useState<PackagingState | null>(
    null,
  );
  const [isHydrated, setIsHydrated] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [packageType, setPackageType] = useState<PackageType>("box");
  const [dimensions, setDimensions] = useState<PackageDimensions>(
    DEFAULT_PACKAGE_DIMENSIONS.box,
  );
  const [packageModel, setPackageModel] = useState<PackageModel | null>(null);
  const [selectedPanelId, setSelectedPanelId] = useState<PanelId | null>(null);
  const [activeView, setActiveView] = useState<ViewMode>("3d");
  const [panelTextures, setPanelTextures] = useState<
    Partial<Record<PanelId, string>>
  >({});
  const [showTextureNotification, setShowTextureNotification] = useState<{
    panelId: PanelId;
    show: boolean;
  } | null>(null);
  const [currentProject, setCurrentProject] = useState<SavedProjectSummary | null>(null);
  const [isSavingProject, setIsSavingProject] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);

  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingDimensionsRef = useRef<PackageDimensions | null>(null);
  const notificationTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const saveMessageTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const applyPackagingState = useCallback(
    async (state: PackagingState, targetType?: PackageType) => {
      const resolved = resolvePackagingModel(
        state,
        targetType || state.current_package_type || "box",
      );

      setPackagingState(state);
      setPackageType(resolved.type);
      setDimensions(resolved.dimensions);
      setPackageModel(resolved.model);
      setPanelTextures(
        await loadCachedPanelTextures(
          resolved.model,
          resolved.shapeState.panel_textures,
        ),
      );
    },
    [],
  );

  const hydrateFromBackend = useCallback(async () => {
    try {
      const state = await getPackagingState();
      await applyPackagingState(state);
      setIsGenerating(state.in_progress || state.bulk_generation_in_progress);
    } catch {
      setPackagingState(null);
      setPackageType("box");
      setDimensions(DEFAULT_PACKAGE_DIMENSIONS.box);
      setPackageModel(
        generatePackageModel("box", DEFAULT_PACKAGE_DIMENSIONS.box),
      );
      setPanelTextures({});
    } finally {
      setIsHydrated(true);
    }
  }, [applyPackagingState]);

  useEffect(() => {
    void hydrateFromBackend().finally(stopLoading);
  }, [hydrateFromBackend, stopLoading]);

  useEffect(() => {
    void Promise.all([updateCurrentProjectContext("/packaging"), getCurrentProject()])
      .then(([updatedProject, currentProject]) => {
        setCurrentProject(updatedProject ?? currentProject);
      })
      .catch(() => {
        // Packaging can still run without an active saved project.
      });
  }, []);

  useEffect(() => {
    if (!isGenerating) {
      return;
    }

    let isCancelled = false;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;

    const poll = async () => {
      try {
        const nextState = await getPackagingState();
        if (isCancelled) {
          return;
        }

        setPackagingState(nextState);

        if (nextState.in_progress || nextState.bulk_generation_in_progress) {
          timeoutId = setTimeout(poll, GENERATION_POLL_INTERVAL_MS);
          return;
        }

        setIsGenerating(false);
        await clearTextureCache();
        if (isCancelled) {
          return;
        }

        const resolved = resolvePackagingModel(nextState, packageType);
        setPanelTextures(
          await loadCachedPanelTextures(
            resolved.model,
            resolved.shapeState.panel_textures,
          ),
        );
      } catch {
        if (!isCancelled) {
          timeoutId = setTimeout(poll, GENERATION_POLL_INTERVAL_MS);
        }
      }
    };

    void poll();

    return () => {
      isCancelled = true;
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    };
  }, [isGenerating, packageType]);

  useEffect(() => {
    if (!isHydrated) {
      return;
    }

    setPackageModel(generatePackageModel(packageType, dimensions));
    setSelectedPanelId(null);
  }, [dimensions, isHydrated, packageType]);

  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
      if (notificationTimeoutRef.current) {
        clearTimeout(notificationTimeoutRef.current);
      }
      if (saveMessageTimeoutRef.current) {
        clearTimeout(saveMessageTimeoutRef.current);
      }
    };
  }, []);

  const persistDimensionsNow = useCallback(async () => {
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
      saveTimeoutRef.current = null;
    }

    const nextDimensions = pendingDimensionsRef.current ?? dimensions;
    pendingDimensionsRef.current = null;
    await updatePackagingDimensions(packageType, nextDimensions);
  }, [dimensions, packageType]);

  const saveDimensionsDebounced = useCallback(
    (type: PackageType, nextDimensions: PackageDimensions) => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }

      pendingDimensionsRef.current = nextDimensions;

      saveTimeoutRef.current = setTimeout(async () => {
        if (!pendingDimensionsRef.current) {
          return;
        }

        try {
          await updatePackagingDimensions(type, pendingDimensionsRef.current);
        } finally {
          pendingDimensionsRef.current = null;
        }
      }, DIMENSION_SAVE_DEBOUNCE_MS);
    },
    [],
  );

  const handlePackageTypeChange = useCallback(
    async (type: PackageType) => {
      if (!packagingState) {
        return;
      }

      const targetShapeState = getShapeState(packagingState, type);
      const targetDimensions = normalizePackageDimensions(
        type,
        targetShapeState.dimensions,
      );
      const targetModel = generatePackageModel(type, targetDimensions);

      setPackageType(type);
      setDimensions(targetDimensions);
      setPackageModel(targetModel);
      setSelectedPanelId(null);
      setPanelTextures(
        await loadCachedPanelTextures(targetModel, targetShapeState.panel_textures),
      );
      setPackagingState((previous) =>
        previous ? { ...previous, current_package_type: type } : previous,
      );

      try {
        await updatePackagingDimensions(type, targetDimensions);
      } catch {
        // Keep the local switch; the next hydration will reconcile persisted state.
      }
    },
    [packagingState],
  );

  const handleDimensionChange = useCallback(
    (key: keyof PackageDimensions, value: number) => {
      const validValue = Number.isNaN(value) || value < 0 ? 0 : value;

      setDimensions((previous) => {
        const nextDimensions = { ...previous, [key]: validValue };

        setPackagingState((previousState) => {
          if (!previousState) {
            return previousState;
          }

          if (packageType === "cylinder") {
            return {
              ...previousState,
              cylinder_state: {
                ...previousState.cylinder_state,
                dimensions: nextDimensions,
              },
            };
          }

          return {
            ...previousState,
            box_state: {
              ...previousState.box_state,
              dimensions: nextDimensions,
            },
          };
        });

        saveDimensionsDebounced(packageType, nextDimensions);
        return nextDimensions;
      });
    },
    [packageType, saveDimensionsDebounced],
  );

  const handleResetCurrentShape = useCallback(async () => {
    try {
      const result = await resetCurrentShape();
      const defaultDimensions = normalizePackageDimensions(
        packageType,
        result.dimensions as Partial<PackageDimensions>,
      );

      await clearTextureCache();
      setPanelTextures({});
      setDimensions(defaultDimensions);
      setPackageModel(generatePackageModel(packageType, defaultDimensions));
      setSelectedPanelId(null);

      setPackagingState((previousState) => {
        if (!previousState) {
          return previousState;
        }

        if (packageType === "cylinder") {
          return {
            ...previousState,
            cylinder_state: {
              ...previousState.cylinder_state,
              dimensions: defaultDimensions,
              panel_textures: {},
            },
          };
        }

        return {
          ...previousState,
          box_state: {
            ...previousState.box_state,
            dimensions: defaultDimensions,
            panel_textures: {},
          },
        };
      });
    } catch {
      // Leave the current local state intact when reset fails.
    }
  }, [packageType]);

  const handleDielineChange = useCallback((newDielines: DielinePath[]) => {
    setPackageModel((previous) => {
      if (!previous) {
        return previous;
      }

      return updateModelFromDielines(previous, newDielines);
    });
  }, []);

  const handleTextureGenerated = useCallback(
    async (panelId: PanelId, textureUrl: string) => {
      await clearTextureCache(panelId);

      try {
        const cachedUrl = await getCachedTextureUrl(panelId, textureUrl);

        setPanelTextures((previous) => ({ ...previous, [panelId]: cachedUrl }));
        setPackageModel((previous) => {
          if (!previous) {
            return previous;
          }

          return {
            ...previous,
            panelStates: {
              ...previous.panelStates,
              [panelId]: {
                ...previous.panelStates[panelId],
                textureUrl: cachedUrl,
              },
            },
          };
        });

        setShowTextureNotification({ panelId, show: true });

        if (notificationTimeoutRef.current) {
          clearTimeout(notificationTimeoutRef.current);
        }

        notificationTimeoutRef.current = setTimeout(() => {
          setShowTextureNotification(null);
        }, TEXTURE_NOTIFICATION_TIMEOUT_MS);
      } catch {
        // Ignore cache failures; the backend state remains the source of truth.
      }
    },
    [],
  );

  const handleSaveProject = useCallback(async () => {
    try {
      setIsSavingProject(true);
      await persistDimensionsNow();
      const savedProject = await saveCurrentProject({ lastRoute: "/packaging" });
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
  }, [persistDimensionsNow]);

  const surfaceArea = useMemo(
    () => calculatePackageSurfaceArea(packageType, dimensions),
    [dimensions, packageType],
  );

  const volume = useMemo(
    () => calculatePackageVolume(packageType, dimensions),
    [dimensions, packageType],
  );

  if (!isHydrated || !packageModel) {
    return (
      <div className="h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4" />
          <p className="text-muted-foreground">Loading packaging state...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen bg-background flex flex-col overflow-hidden">
      <div className="border-b-2 border-black bg-card px-4 py-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground">
              Packaging Workspace
            </div>
            <div className="mt-1 text-sm font-semibold">
              {currentProject?.name ?? "Unsaved project"}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="text-xs text-muted-foreground">
              {currentProject?.has_packaging ? "Packaging state linked to project" : "Save to add this packaging work to a project"}
            </div>
            <Button onClick={() => void handleSaveProject()} disabled={isSavingProject || isGenerating}>
              {isSavingProject ? "Saving..." : "Save Project"}
            </Button>
            {saveMessage ? (
              <div className="text-xs text-muted-foreground">{saveMessage}</div>
            ) : null}
          </div>
        </div>
      </div>
      <div className="flex-1 flex overflow-hidden">
        <div className="flex-1 flex flex-col overflow-hidden">
          <div className="flex-1 overflow-hidden">
            {activeView === "2d" ? (
              <DielineEditor
                key={`${packageType}-${dimensions.width}-${dimensions.height}-${dimensions.depth}`}
                dielines={packageModel.dielines}
                panels={packageModel.panels}
                selectedPanelId={selectedPanelId}
                onDielineChange={handleDielineChange}
                onPanelSelect={setSelectedPanelId}
                editable
                panelTextures={panelTextures}
              />
            ) : (
              <div className="h-full bg-muted/30 relative">
                <PackageViewer3D
                  model={packageModel}
                  selectedPanelId={selectedPanelId}
                  onPanelSelect={setSelectedPanelId}
                  color="#60a5fa"
                  panelTextures={panelTextures}
                  lightingMode="studio"
                  wireframe={false}
                  autoRotate
                />

                {isGenerating && packagingState && (
                  <div className="absolute top-4 left-4 z-40 bg-black/80 text-white px-4 py-3 rounded-lg shadow-lg">
                    <div className="flex items-center gap-2">
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      <div>
                        <p className="text-sm font-semibold">Generating Textures</p>
                        {packagingState.generating_panels.length > 0 && (
                          <p className="text-xs opacity-80">
                            {packagingState.generating_panels.length} panel(s)
                            remaining
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {showTextureNotification?.show && (
                  <div className="absolute top-4 left-1/2 transform -translate-x-1/2 z-50 animate-in fade-in slide-in-from-top-2 duration-300">
                    <div className="bg-green-600 text-white px-6 py-3 rounded-lg shadow-lg flex items-center gap-3 border-2 border-green-700">
                      <CheckCircle2 className="w-5 h-5" />
                      <div>
                        <p className="font-semibold">Texture Applied!</p>
                        <p className="text-sm opacity-90">
                          {
                            packageModel.panels.find(
                              (panel) => panel.id === showTextureNotification.panelId,
                            )?.name
                          }{" "}
                          panel updated
                        </p>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="w-[380px] border-l-2 border-black bg-card overflow-hidden flex flex-col shrink-0">
          <Tabs defaultValue="chat" className="flex-1 flex flex-col">
            <div className="border-b-2 border-black shrink-0 px-4 py-3">
              <TabsList className="w-full grid grid-cols-2 gap-2 bg-transparent p-0 h-auto">
                <TabsTrigger
                  value="chat"
                  className="gap-2 border-2 border-black data-[state=active]:bg-black data-[state=active]:text-white data-[state=inactive]:bg-background shadow-none"
                >
                  <MessageSquare className="w-4 h-4" />
                  Chat
                </TabsTrigger>
                <TabsTrigger
                  value="editor"
                  className="gap-2 border-2 border-black data-[state=active]:bg-black data-[state=active]:text-white data-[state=inactive]:bg-background shadow-none"
                >
                  <Pencil className="w-4 h-4" />
                  Editor
                </TabsTrigger>
              </TabsList>
            </div>

            <TabsContent
              value="chat"
              className="flex-1 overflow-y-auto p-4 flex flex-col space-y-4 mt-0"
            >
              <AIChatPanel
                selectedPanelId={selectedPanelId}
                packageModel={packageModel}
                onTextureGenerated={handleTextureGenerated}
                onGenerationStart={() => setIsGenerating(true)}
                packagingState={packagingState}
                isGenerating={isGenerating}
              />

              {packageModel.panels.length > 0 && (
                <div className="border-2 border-black p-4 space-y-3">
                  <h3 className="text-sm font-semibold text-foreground">
                    Select Panel
                  </h3>
                  <div className="grid grid-cols-2 gap-2">
                    {packageModel.panels.map((panel) => (
                      <Button
                        key={panel.id}
                        variant={
                          selectedPanelId === panel.id ? "default" : "outline"
                        }
                        className="text-xs"
                        size="sm"
                        onClick={() =>
                          setSelectedPanelId(
                            panel.id === selectedPanelId ? null : panel.id,
                          )
                        }
                      >
                        {panel.name}
                        {panelTextures[panel.id] && (
                          <span className="ml-1 text-[10px]">*</span>
                        )}
                      </Button>
                    ))}
                  </div>
                  {selectedPanelId && (
                    <div className="mt-2 p-2 border-2 border-black text-xs">
                      <p className="font-medium">
                        {
                          packageModel.panels.find(
                            (panel) => panel.id === selectedPanelId,
                          )?.name
                        }
                      </p>
                      <p className="text-muted-foreground mt-1">
                        {
                          packageModel.panels.find(
                            (panel) => panel.id === selectedPanelId,
                          )?.description
                        }
                      </p>
                    </div>
                  )}
                </div>
              )}
            </TabsContent>

            <PackagingEditor
              activeView={activeView}
              dimensions={dimensions}
              handleDimensionChange={handleDimensionChange}
              handlePackageTypeChange={handlePackageTypeChange}
              handleResetCurrentShape={handleResetCurrentShape}
              packageModel={packageModel}
              packageType={packageType}
              setActiveView={setActiveView}
              surfaceArea={surfaceArea}
              volume={volume}
            />
          </Tabs>
        </div>
      </div>
    </div>
  );
}

export default Packaging;
