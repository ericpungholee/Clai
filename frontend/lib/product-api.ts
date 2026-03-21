import { fetchBlob, fetchJson } from "@/lib/api-client";
import { API_ENDPOINTS } from "@/lib/api-config";
import { ProductState, ProductStatus } from "@/lib/product-types";

export interface ProductEditInput {
  prompt: string;
  editType?: "whole_product" | "region" | "restyle_materials";
  targetScope?: string;
}

function normalizeProductApiError(error: unknown): Error {
  if (
    error instanceof Error &&
    error.message.includes("Generation already running")
  ) {
    return new Error(
      "A product operation is already in progress. Please wait for it to complete or use the recover option.",
    );
  }

  return error instanceof Error ? error : new Error("Request failed");
}

function normalizeEditInput(input: string | ProductEditInput): Required<ProductEditInput> {
  if (typeof input === "string") {
    return {
      prompt: input,
      editType: "whole_product",
      targetScope: "whole_product",
    };
  }

  return {
    prompt: input.prompt,
    editType: input.editType ?? "whole_product",
    targetScope: input.targetScope ?? "whole_product",
  };
}

export async function createProduct(
  prompt: string,
  imageCount: number = 1,
): Promise<ProductStatus> {
  try {
    return await fetchJson<ProductStatus>(API_ENDPOINTS.product.create, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt, image_count: imageCount }),
    });
  } catch (error) {
    throw normalizeProductApiError(error);
  }
}

export async function refineProductConcepts(prompt: string): Promise<ProductStatus> {
  return fetchJson<ProductStatus>(API_ENDPOINTS.product.refineConcepts, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt }),
  });
}

export async function selectProductConcept(
  conceptId: string,
  options?: { combineWithIds?: string[]; notes?: string },
): Promise<{
  status: string;
  selected_concept_id: string;
  selected_concept_title: string;
}> {
  return fetchJson(API_ENDPOINTS.product.selectConcept, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      concept_id: conceptId,
      combine_with_ids: options?.combineWithIds ?? [],
      notes: options?.notes,
    }),
  });
}

export async function generateProductReferences(
  options?: { conceptId?: string; notes?: string },
): Promise<ProductStatus> {
  return fetchJson<ProductStatus>(API_ENDPOINTS.product.generateReferences, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      concept_id: options?.conceptId,
      notes: options?.notes,
    }),
  });
}

export async function generateProductDraft(): Promise<ProductStatus> {
  return fetchJson<ProductStatus>(API_ENDPOINTS.product.generateDraft, {
    method: "POST",
  });
}

export async function editProduct(
  input: string | ProductEditInput,
): Promise<ProductStatus> {
  const request = normalizeEditInput(input);

  try {
    return await fetchJson<ProductStatus>(API_ENDPOINTS.product.edit, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        prompt: request.prompt,
        edit_type: request.editType,
        target_scope: request.targetScope,
      }),
    });
  } catch (error) {
    throw normalizeProductApiError(error);
  }
}

export async function editProductRegion(
  prompt: string,
  regionId: string,
): Promise<ProductStatus> {
  return fetchJson<ProductStatus>(API_ENDPOINTS.product.editRegion, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt, region_id: regionId }),
  });
}

export async function updateProductEditorState(input: {
  interactionMode?: "view" | "direct_edit";
  handlesVisible?: boolean;
  activeTool?: "resize" | "move" | "rotate";
  transform?: {
    position: [number, number, number];
    rotation: [number, number, number];
    scale: [number, number, number];
  };
}): Promise<{
  status: string;
  editor_state: ProductState["editor_state"];
}> {
  return fetchJson(API_ENDPOINTS.product.updateEditorState, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      interaction_mode: input.interactionMode,
      handles_visible: input.handlesVisible,
      active_tool: input.activeTool,
      transform: input.transform,
    }),
  });
}

export async function getProductState(): Promise<ProductState> {
  return fetchJson<ProductState>(API_ENDPOINTS.product.state);
}

export async function getProductStatus(): Promise<ProductStatus> {
  return fetchJson<ProductStatus>(API_ENDPOINTS.product.status);
}

export function getProductViewerModelUrl(state: Pick<ProductState, "active_version_id">): string {
  if (state.active_version_id) {
    return API_ENDPOINTS.product.versionModel(state.active_version_id);
  }
  return API_ENDPOINTS.product.currentModel;
}

export async function rewindProduct(
  iterationIndex: number,
): Promise<{
  status: string;
  iteration_index: number;
  total_iterations: number;
  active_version_id?: string;
}> {
  return fetchJson(API_ENDPOINTS.product.rewind(iterationIndex), {
    method: "POST",
  });
}

export async function recoverProductState(): Promise<{
  recovered: boolean;
  message?: string;
  workflow_stage?: string;
}> {
  return fetchJson(API_ENDPOINTS.product.recover, {
    method: "POST",
  });
}

export async function recoverProductVersion(versionId: string): Promise<{
  status: string;
  version_id: string;
  active_version_id: string;
}> {
  return fetchJson(API_ENDPOINTS.product.recoverVersion(versionId), {
    method: "POST",
  });
}

export async function exportProductFormats(): Promise<{
  status: string;
  files: Record<string, string>;
}> {
  return fetchJson(API_ENDPOINTS.product.export, {
    method: "POST",
  });
}

export async function downloadProductExport(
  format: "blend" | "stl" | "jpg",
): Promise<Blob> {
  return fetchBlob(API_ENDPOINTS.product.downloadExport(format));
}

export async function clearProductState(): Promise<{
  message: string;
  state: ProductState;
}> {
  return fetchJson(API_ENDPOINTS.product.clear, {
    method: "POST",
  });
}
