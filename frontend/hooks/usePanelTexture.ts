"use client";

import { useState } from "react";
import { readErrorMessage } from "@/lib/api-client";
import { API_ENDPOINTS } from "@/lib/api-config";
import type { PackagingState, PanelId } from "@/lib/packaging-types";

const SINGLE_PANEL_MAX_ATTEMPTS = 60;
const BULK_MAX_ATTEMPTS = 180;
const BULK_POLL_INTERVAL_MS = 2000;
const SINGLE_POLL_BASE_DELAY_MS = 2000;
const SINGLE_POLL_MAX_DELAY_MS = 8000;

export interface PanelTexture {
  panel_id: string;
  texture_url: string;
  prompt: string;
  dimensions?: { width: number; height: number };
  generated_at?: string;
}

export interface GenerateTextureRequest {
  panel_id: PanelId;
  prompt: string;
  package_type: string;
  panel_dimensions: { width: number; height: number };
  package_dimensions: { width: number; height: number; depth: number };
  reference_mockup?: string;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isNewTexture(
  texture: { generated_at?: string },
  requestStartTime?: string,
): boolean {
  if (!requestStartTime || !texture.generated_at) {
    return true;
  }

  return texture.generated_at >= requestStartTime;
}

function hasTextureUrl(
  texture: Partial<PanelTexture> | null | undefined,
): texture is PanelTexture {
  return Boolean(texture?.texture_url?.trim());
}

function isTerminalSinglePanelError(message: string): boolean {
  return (
    message.includes("Cannot connect to backend") ||
    message.includes("Texture generation not in progress") ||
    message.includes("Texture generation timeout") ||
    message.includes("Failed to generate") ||
    message.includes("HTTP ")
  );
}

export function usePanelTexture() {
  const [generating, setGenerating] = useState<string | null>(null);
  const [bulkGenerating, setBulkGenerating] = useState(false);
  const [generatingPanels, setGeneratingPanels] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  const fetchPackagingState = async (): Promise<PackagingState | null> => {
    try {
      const response = await fetch(API_ENDPOINTS.packaging.state);
      if (!response.ok) {
        return null;
      }

      return (await response.json()) as PackagingState;
    } catch {
      return null;
    }
  };

  const readTexture = async (
    panelId: string,
  ): Promise<{ response: Response; data: PanelTexture | null }> => {
    const response = await fetch(API_ENDPOINTS.packaging.getTexture(panelId));
    if (!response.ok) {
      return { response, data: null };
    }

    return {
      response,
      data: (await response.json()) as PanelTexture,
    };
  };

  const getTexture = async (panelId: string): Promise<PanelTexture | null> => {
    try {
      const { data } = await readTexture(panelId);
      return data;
    } catch {
      return null;
    }
  };

  const pollForTexture = async (
    panelId: string,
    requestStartTime?: string,
    maxAttempts: number = SINGLE_PANEL_MAX_ATTEMPTS,
  ): Promise<PanelTexture | null> => {
    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      if (attempt > 0) {
        const delayMs = Math.min(
          SINGLE_POLL_BASE_DELAY_MS * 1.3 ** Math.min(attempt - 1, 5),
          SINGLE_POLL_MAX_DELAY_MS,
        );
        await delay(delayMs);
      }

      try {
        const state = await fetchPackagingState();
        if (state?.last_error) {
          throw new Error(state.last_error);
        }

        const { response, data } = await readTexture(panelId);

        if (response.ok && data) {
          if (!isNewTexture(data, requestStartTime)) {
            continue;
          }

          if (hasTextureUrl(data)) {
            return data;
          }

          continue;
        }

        if (response.status === 202) {
          continue;
        }

        if (response.status === 404) {
          if (state?.in_progress && state.generating_panel === panelId) {
            continue;
          }

          const finalTexture = await getTexture(panelId);
          if (finalTexture && isNewTexture(finalTexture, requestStartTime)) {
            return finalTexture;
          }

          throw new Error("Texture generation not in progress");
        }

        throw new Error(await readErrorMessage(response));
      } catch (pollError) {
        if (attempt === maxAttempts - 1) {
          throw pollError;
        }

        if (
          pollError instanceof Error &&
          isTerminalSinglePanelError(pollError.message)
        ) {
          throw pollError;
        }
      }
    }

    throw new Error("Texture generation timeout");
  };

  const generateTexture = async (
    request: GenerateTextureRequest,
  ): Promise<PanelTexture | null> => {
    setGenerating(request.panel_id);
    setError(null);

    const requestStartTime = new Date().toISOString();

    try {
      let response: Response;

      try {
        response = await fetch(API_ENDPOINTS.packaging.generate, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(request),
        });
      } catch (fetchError) {
        if (fetchError instanceof TypeError) {
          throw new Error(
            "Cannot connect to backend at http://127.0.0.1:8000. Make sure the backend is running.",
          );
        }

        throw fetchError;
      }

      if (!response.ok) {
        throw new Error(await readErrorMessage(response));
      }

      return await pollForTexture(request.panel_id, requestStartTime);
    } catch (generationError) {
      const message =
        generationError instanceof Error
          ? generationError.message
          : "Failed to generate texture";
      setError(message);
      return null;
    } finally {
      setGenerating(null);
    }
  };

  const deleteTexture = async (panelId: string): Promise<boolean> => {
    try {
      const response = await fetch(API_ENDPOINTS.packaging.deleteTexture(panelId), {
        method: "DELETE",
      });
      return response.ok;
    } catch {
      return false;
    }
  };

  const pollForAllTextures = async (
    panelIds: string[],
    requestStartTime: string,
    maxAttempts: number = BULK_MAX_ATTEMPTS,
  ): Promise<void> => {
    const completedPanels = new Set<string>();

    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      if (attempt > 0) {
        await delay(BULK_POLL_INTERVAL_MS);
      }

      const state = await fetchPackagingState();
      if (state?.last_error && completedPanels.size === 0) {
        throw new Error(state.last_error);
      }

      await Promise.all(
        panelIds
          .filter((panelId) => !completedPanels.has(panelId))
          .map(async (panelId) => {
            const texture = await getTexture(panelId);
            if (texture && hasTextureUrl(texture) && isNewTexture(texture, requestStartTime)) {
              completedPanels.add(panelId);
            }
          }),
      );

      if (completedPanels.size === panelIds.length) {
        return;
      }

      if (
        state &&
        !state.bulk_generation_in_progress &&
        state.generating_panels.length === 0
      ) {
        break;
      }
    }

    await Promise.all(
      panelIds
        .filter((panelId) => !completedPanels.has(panelId))
        .map(async (panelId) => {
          const texture = await getTexture(panelId);
          if (texture && hasTextureUrl(texture) && isNewTexture(texture, requestStartTime)) {
            completedPanels.add(panelId);
          }
        }),
    );

    if (completedPanels.size === panelIds.length) {
      return;
    }

    if (completedPanels.size > 0) {
      return;
    }

    const finalState = await fetchPackagingState();
    if (finalState?.last_error) {
      throw new Error(finalState.last_error);
    }

    throw new Error("Texture generation timeout - no panels completed");
  };

  const generateAllTextures = async (request: {
    prompt: string;
    package_type: string;
    package_dimensions: { width: number; height: number; depth: number };
    panel_ids: string[];
    panels_info: Record<string, { width: number; height: number }>;
    reference_mockup?: string;
  }): Promise<boolean> => {
    setBulkGenerating(true);
    setGeneratingPanels(request.panel_ids);
    setError(null);

    const requestStartTime = new Date().toISOString();

    try {
      const response = await fetch(API_ENDPOINTS.packaging.generateAll, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(request),
      });

      if (!response.ok) {
        throw new Error(await readErrorMessage(response));
      }

      await pollForAllTextures(request.panel_ids, requestStartTime);
      return true;
    } catch (generationError) {
      const message =
        generationError instanceof Error
          ? generationError.message
          : "Failed to generate textures";
      setError(message);
      return false;
    } finally {
      setBulkGenerating(false);
      setGeneratingPanels([]);
    }
  };

  return {
    deleteTexture,
    error,
    generateAllTextures,
    generateTexture,
    generating,
    generatingPanels,
    bulkGenerating,
    getTexture,
  };
}
