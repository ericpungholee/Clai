import { getCachedTextureUrl } from "@/lib/texture-cache";
import {
  DEFAULT_PACKAGE_DIMENSIONS,
  generatePackageModel,
} from "@/lib/packaging-types";
import type {
  PackageDimensions,
  PackageModel,
  PackageType,
  PackagingState,
  PanelId,
  ShapeState,
} from "@/lib/packaging-types";

export interface PanelDimensions {
  width: number;
  height: number;
}

export interface ResolvedPackagingModel {
  type: PackageType;
  dimensions: PackageDimensions;
  model: PackageModel;
  shapeState: ShapeState;
}

export function getShapeState(
  state: PackagingState,
  type: PackageType = state.current_package_type || "box",
): ShapeState {
  return type === "cylinder" ? state.cylinder_state : state.box_state;
}

export function normalizePackageDimensions(
  type: PackageType,
  dimensions?: Partial<PackageDimensions> | null,
): PackageDimensions {
  const defaults = DEFAULT_PACKAGE_DIMENSIONS[type];

  return {
    width:
      typeof dimensions?.width === "number" && Number.isFinite(dimensions.width)
        ? dimensions.width
        : defaults.width,
    height:
      typeof dimensions?.height === "number" && Number.isFinite(dimensions.height)
        ? dimensions.height
        : defaults.height,
    depth:
      typeof dimensions?.depth === "number" && Number.isFinite(dimensions.depth)
        ? dimensions.depth
        : defaults.depth,
  };
}

export function resolvePackagingModel(
  state: PackagingState,
  type: PackageType = state.current_package_type || "box",
): ResolvedPackagingModel {
  const shapeState = getShapeState(state, type);
  const dimensions = normalizePackageDimensions(type, shapeState?.dimensions);

  return {
    type,
    dimensions,
    model: generatePackageModel(type, dimensions),
    shapeState: {
      ...shapeState,
      dimensions,
    },
  };
}

export function getPanelDimensions(
  model: PackageModel,
  panelId: PanelId,
): PanelDimensions {
  if (model.type === "box") {
    const { width, height, depth } = model.dimensions;

    switch (panelId) {
      case "front":
      case "back":
        return { width, height };
      case "left":
      case "right":
        return { width: depth, height };
      case "top":
      case "bottom":
        return { width, height: depth };
      default:
        break;
    }
  } else {
    const { width, height } = model.dimensions;

    if (panelId === "body") {
      return { width: Math.PI * width, height };
    }

    const diameter = width;
    return { width: diameter, height: diameter };
  }

  const panel = model.panels.find((candidate) => candidate.id === panelId);
  if (panel?.bounds) {
    return {
      width: panel.bounds.maxX - panel.bounds.minX,
      height: panel.bounds.maxY - panel.bounds.minY,
    };
  }

  return { width: 100, height: 100 };
}

export function getPanelsInfo(
  model: PackageModel,
): Record<string, PanelDimensions> {
  return Object.fromEntries(
    model.panels.map((panel) => [panel.id, getPanelDimensions(model, panel.id)]),
  );
}

export function calculatePackageSurfaceArea(
  type: PackageType,
  dimensions: PackageDimensions,
): number {
  const { width, height, depth } = dimensions;

  return type === "box"
    ? Math.round(2 * (width * height + width * depth + height * depth))
    : Math.round(Math.PI * width * height + 2 * Math.PI * (width / 2) ** 2);
}

export function calculatePackageVolume(
  type: PackageType,
  dimensions: PackageDimensions,
): number {
  const { width, height, depth } = dimensions;

  return type === "box"
    ? Math.round(width * height * depth)
    : Math.round(Math.PI * (width / 2) ** 2 * height);
}

export async function loadCachedPanelTextures(
  model: PackageModel,
  panelTextures: ShapeState["panel_textures"],
): Promise<Partial<Record<PanelId, string>>> {
  const cachedTextures: Partial<Record<PanelId, string>> = {};

  for (const [panelId, texture] of Object.entries(panelTextures || {})) {
    if (!texture?.texture_url || !model.panels.some((panel) => panel.id === panelId)) {
      continue;
    }

    try {
      cachedTextures[panelId as PanelId] = await getCachedTextureUrl(
        panelId,
        texture.texture_url,
      );
    } catch {
      // Skip textures that fail to hydrate; the rest of the model can still render.
    }
  }

  return cachedTextures;
}
