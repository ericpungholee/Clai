"use client";

import { useCallback, useEffect, useState, type ChangeEvent } from "react";
import { ImagePlus, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { fetchJson } from "@/lib/api-client";
import { API_ENDPOINTS } from "@/lib/api-config";
import {
  getPanelDimensions,
  getPanelsInfo,
} from "@/lib/packaging-helpers";
import type {
  PackageModel,
  PackagingState,
  PanelId,
} from "@/lib/packaging-types";
import { usePanelTexture } from "@/hooks/usePanelTexture";

export interface PackagingAIChatPanelProps {
  selectedPanelId?: PanelId | null;
  packageModel?: PackageModel;
  onTextureGenerated?: (panelId: PanelId, textureUrl: string) => void;
  onGenerationStart?: () => void;
  packagingState?: PackagingState | null;
  isGenerating?: boolean;
  productState?: never;
  isEditInProgress?: never;
  onEditStart?: never;
  onEditComplete?: never;
  onEditError?: never;
}

interface ChatHistoryItem {
  prompt: string;
  response: string;
}

const MAX_REFERENCE_FILE_SIZE = 5 * 1024 * 1024;
const VAGUE_PROMPTS = new Set([
  "logo",
  "design",
  "texture",
  "pattern",
  "cool",
  "nice",
  "good",
  "emblem",
  "symbol",
  "brand",
]);

function validatePrompt(text: string): string | null {
  const trimmed = text.trim();

  if (!trimmed) {
    return null;
  }

  if (trimmed.length < 3) {
    return "Prompt is too short. Please be more specific.";
  }

  const words = trimmed.toLowerCase().split(/\s+/);
  if (
    VAGUE_PROMPTS.has(trimmed.toLowerCase()) ||
    (words.length === 2 && VAGUE_PROMPTS.has(words[1]))
  ) {
    return `"${trimmed}" is too vague. Please describe the style, colors, or patterns you want. Example: "blue geometric pattern with white lines".`;
  }

  return null;
}

export function PackagingAIChatPanel({
  selectedPanelId,
  packageModel,
  onTextureGenerated,
  onGenerationStart,
  packagingState,
  isGenerating,
}: PackagingAIChatPanelProps) {
  const [prompt, setPrompt] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [history, setHistory] = useState<ChatHistoryItem[]>([]);
  const [referenceMockup, setReferenceMockup] = useState<string | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);

  const {
    bulkGenerating,
    error,
    generateAllTextures,
    generateTexture,
  } = usePanelTexture();

  const showGenerating = isGenerating || bulkGenerating || isProcessing;
  const showBulkGenerating =
    packagingState?.bulk_generation_in_progress || bulkGenerating;

  const pushHistory = useCallback((entry: ChatHistoryItem) => {
    setHistory((previous) => [...previous, entry]);
  }, []);

  useEffect(() => {
    setValidationError(validatePrompt(prompt));
  }, [prompt]);

  const handleMockupUpload = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (!file) {
        return;
      }

      if (file.size > MAX_REFERENCE_FILE_SIZE) {
        pushHistory({
          prompt: "Reference upload",
          response: "Image too large. Please use an image under 5MB.",
        });
        return;
      }

      const reader = new FileReader();
      reader.onload = (loadEvent) => {
        const base64 = loadEvent.target?.result;
        if (typeof base64 !== "string") {
          return;
        }

        setReferenceMockup(base64);
        pushHistory({
          prompt: "Reference mockup uploaded",
          response:
            "Reference image uploaded successfully. Your next generation will use it as a style guide.",
        });
      };
      reader.readAsDataURL(file);
    },
    [pushHistory],
  );

  const handleGenerateAll = useCallback(async () => {
    const trimmedPrompt = prompt.trim();
    if (!trimmedPrompt) {
      return;
    }

    const nextValidationError = validatePrompt(trimmedPrompt);
    if (nextValidationError) {
      setValidationError(nextValidationError);
      pushHistory({
        prompt: trimmedPrompt,
        response: nextValidationError,
      });
      return;
    }

    if (!packageModel) {
      pushHistory({
        prompt: trimmedPrompt,
        response: "Package model not available.",
      });
      setPrompt("");
      return;
    }

    setIsProcessing(true);

    try {
      const panelIds = packageModel.panels.map((panel) => panel.id);

      onGenerationStart?.();

      const success = await generateAllTextures({
        prompt: trimmedPrompt,
        package_type: packageModel.type,
        package_dimensions: packageModel.dimensions,
        panel_ids: panelIds,
        panels_info: getPanelsInfo(packageModel),
        reference_mockup: referenceMockup || undefined,
      });

      if (!success) {
        pushHistory({
          prompt: trimmedPrompt,
          response: error || "Failed to generate textures. Please try again.",
        });
        return;
      }

      pushHistory({
        prompt: trimmedPrompt,
        response: `Successfully generated textures for all ${panelIds.length} panels.`,
      });

      await Promise.all(
        panelIds.map(async (panelId) => {
          try {
            const texture = await fetchJson<{ texture_url?: string }>(
              API_ENDPOINTS.packaging.getTexture(panelId),
            );

            if (texture.texture_url) {
              onTextureGenerated?.(panelId, texture.texture_url);
            }
          } catch {
            // Ignore individual texture fetch failures after bulk generation.
          }
        }),
      );
    } catch (generationError) {
      const message =
        generationError instanceof Error
          ? generationError.message
          : "An error occurred";

      pushHistory({
        prompt: trimmedPrompt,
        response: `Error: ${message}`,
      });
    } finally {
      setPrompt("");
      setIsProcessing(false);
    }
  }, [
    error,
    generateAllTextures,
    onGenerationStart,
    onTextureGenerated,
    packageModel,
    prompt,
    pushHistory,
    referenceMockup,
  ]);

  const handleSubmit = useCallback(async () => {
    const trimmedPrompt = prompt.trim();
    if (!trimmedPrompt) {
      return;
    }

    const nextValidationError = validatePrompt(trimmedPrompt);
    if (nextValidationError) {
      setValidationError(nextValidationError);
      pushHistory({
        prompt: trimmedPrompt,
        response: nextValidationError,
      });
      return;
    }

    if (!selectedPanelId) {
      pushHistory({
        prompt: trimmedPrompt,
        response: "Please select a panel first to apply changes.",
      });
      setPrompt("");
      return;
    }

    if (!packageModel) {
      pushHistory({
        prompt: trimmedPrompt,
        response: "Package model not available.",
      });
      setPrompt("");
      return;
    }

    const panel = packageModel.panels.find(
      (candidate) => candidate.id === selectedPanelId,
    );
    if (!panel) {
      pushHistory({
        prompt: trimmedPrompt,
        response: "Selected panel could not be found.",
      });
      setPrompt("");
      return;
    }

    setIsProcessing(true);

    try {
      const texture = await generateTexture({
        panel_id: selectedPanelId,
        prompt: trimmedPrompt,
        package_type: packageModel.type,
        panel_dimensions: getPanelDimensions(packageModel, selectedPanelId),
        package_dimensions: packageModel.dimensions,
        reference_mockup: referenceMockup || undefined,
      });

      if (!texture?.texture_url) {
        pushHistory({
          prompt: trimmedPrompt,
          response:
            error ||
            "Texture generation completed but no image was returned.",
        });
        return;
      }

      pushHistory({
        prompt: trimmedPrompt,
        response: `Successfully applied "${trimmedPrompt}" to the ${panel.name} panel.`,
      });
      onTextureGenerated?.(selectedPanelId, texture.texture_url);
    } catch (generationError) {
      const message =
        generationError instanceof Error
          ? generationError.message
          : "An error occurred";

      pushHistory({
        prompt: trimmedPrompt,
        response: `Error: ${message}`,
      });
    } finally {
      setPrompt("");
      setIsProcessing(false);
    }
  }, [
    error,
    generateTexture,
    onTextureGenerated,
    packageModel,
    prompt,
    pushHistory,
    referenceMockup,
    selectedPanelId,
  ]);

  return (
    <div className="space-y-3">
      <div className="relative">
        <Textarea
          placeholder="Describe style, colors, patterns..."
          value={prompt}
          onChange={(event) => setPrompt(event.target.value)}
          onBlur={(event) => setValidationError(validatePrompt(event.target.value))}
          className={`min-h-[120px] resize-none text-sm pr-10 ${
            validationError ? "border-red-500 border-2 focus:border-red-600" : ""
          }`}
          disabled={showGenerating}
        />

        <input
          type="file"
          id="reference-upload"
          accept="image/*"
          onChange={handleMockupUpload}
          className="hidden"
          disabled={showGenerating}
        />
        <label
          htmlFor="reference-upload"
          className={`absolute bottom-2 right-2 p-1.5 rounded border-2 border-black bg-background hover:bg-muted transition-colors cursor-pointer ${
            showGenerating ? "opacity-50 cursor-not-allowed" : ""
          } ${referenceMockup ? "bg-green-100 border-green-600" : ""}`}
          title={
            referenceMockup
              ? "Reference image loaded (click to change)"
              : "Upload reference image"
          }
        >
          <ImagePlus
            className={`w-4 h-4 ${referenceMockup ? "text-green-600" : ""}`}
          />
        </label>
      </div>

      {referenceMockup && (
        <div className="flex items-center justify-between text-xs p-2 bg-green-50 border-2 border-green-600 rounded">
          <span className="font-medium text-green-700">Reference image loaded</span>
          <button
            onClick={() => setReferenceMockup(null)}
            className="font-semibold text-red-600 hover:underline"
          >
            Remove
          </button>
        </div>
      )}

      {validationError && (
        <div className="text-xs text-red-600 dark:text-red-400 font-medium p-2 bg-red-50 dark:bg-red-950 rounded border-2 border-red-500">
          {validationError}
        </div>
      )}

      <div className="grid grid-cols-2 gap-2">
        <Button
          onClick={() => void handleSubmit()}
          disabled={
            !prompt.trim() ||
            isProcessing ||
            showBulkGenerating ||
            !selectedPanelId ||
            Boolean(validationError)
          }
          variant="outline"
          className="w-full text-xs font-semibold"
          size="sm"
        >
          {isProcessing && !showBulkGenerating ? (
            <>
              <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
              Generating...
            </>
          ) : (
            "Generate Panel"
          )}
        </Button>

        <Button
          onClick={() => void handleGenerateAll()}
          disabled={
            !prompt.trim() ||
            isProcessing ||
            showBulkGenerating ||
            Boolean(validationError)
          }
          variant="default"
          className="w-full text-xs font-semibold"
          size="sm"
        >
          {showBulkGenerating ? (
            <>
              <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
              Generating All...
            </>
          ) : (
            "Generate All Panels"
          )}
        </Button>
      </div>

      {(isProcessing || showBulkGenerating) && (
        <div className="text-xs p-2.5 bg-muted rounded border-2 border-black space-y-1">
          {showBulkGenerating ? (
            <>
              <div className="flex items-center gap-2">
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <p className="font-semibold">Generating panels in parallel</p>
              </div>
              {packagingState?.generating_panels?.length ? (
                <p className="text-muted-foreground">
                  {packagingState.generating_panels.length} panel(s) remaining
                </p>
              ) : null}
              <p className="text-muted-foreground">This may take 1-3 minutes</p>
            </>
          ) : (
            <p className="text-muted-foreground">Generating (10-30 seconds)</p>
          )}
        </div>
      )}

      {history.length > 0 && (
        <div className="space-y-2 pt-2 border-t-2 border-black">
          <div className="text-xs font-semibold text-muted-foreground">HISTORY</div>
          <div className="space-y-2 max-h-[200px] overflow-y-auto">
            {history
              .slice()
              .reverse()
              .map((item, index) => (
                <div
                  key={`${item.prompt}-${index}`}
                  className="text-xs p-2.5 bg-muted/50 rounded border-2 border-black"
                >
                  <p className="font-semibold mb-1.5">{item.prompt}</p>
                  <p className="text-muted-foreground text-[11px] leading-relaxed">
                    {item.response}
                  </p>
                </div>
              ))}
          </div>
        </div>
      )}
    </div>
  );
}
