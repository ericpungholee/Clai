"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Download, Loader2 } from "lucide-react";
import ModelViewer, { ModelViewerRef } from "@/components/ModelViewer";
import {
  PackageViewer3D,
  PackageViewer3DRef,
} from "@/components/package-viewer-3d";
import {
  downloadDielineExport,
  downloadPackageExport,
  getPackagingState,
} from "@/lib/packaging-api";
import {
  loadCachedPanelTextures,
  resolvePackagingModel,
} from "@/lib/packaging-helpers";
import type { PackageModel, PanelId } from "@/lib/packaging-types";
import { getCachedModelUrl } from "@/lib/model-cache";
import {
  downloadProductExport,
  getProductState,
} from "@/lib/product-api";
import { updateCurrentProjectContext } from "@/lib/project-api";
import type { ProductState } from "@/lib/product-types";

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}

export default function FinalView() {
  const [productState, setProductState] = useState<ProductState | null>(null);
  const [productModelUrl, setProductModelUrl] = useState("");
  const [packageModel, setPackageModel] = useState<PackageModel | null>(null);
  const [panelTextures, setPanelTextures] = useState<
    Partial<Record<PanelId, string>>
  >({});
  const [productLoading, setProductLoading] = useState(true);
  const [packagingLoading, setPackagingLoading] = useState(true);
  const [downloading, setDownloading] = useState<Record<string, boolean>>({});

  const productViewerRef = useRef<ModelViewerRef>(null);
  const packageViewerRef = useRef<PackageViewer3DRef>(null);

  const productDownloads = useMemo(
    () => [
      { name: "product.blend", format: "blend" as const },
      { name: "product.stl", format: "stl" as const },
      { name: "product.jpg", format: "jpg" as const },
    ],
    [],
  );

  const packageDownloads = useMemo(
    () => [
      { name: "package.blend", format: "blend" as const },
      { name: "package.stl", format: "stl" as const },
      { name: "package.jpg", format: "jpg" as const },
    ],
    [],
  );

  const dielineDownloads = useMemo(
    () => [{ name: "dieline.pdf", format: "pdf" as const }],
    [],
  );

  const handleDownload = async (
    type: "product" | "package" | "dieline",
    format: string,
  ) => {
    const key = `${type}-${format}`;
    if (downloading[key]) {
      return;
    }

    try {
      setDownloading((previous) => ({ ...previous, [key]: true }));

      let blob: Blob;
      let filename: string;

      if (format === "jpg") {
        if (type === "product" && productViewerRef.current) {
          const dataUrl = await productViewerRef.current.captureScreenshot();
          blob = await (await fetch(dataUrl)).blob();
          filename = "product.jpg";
        } else if (type === "package" && packageViewerRef.current) {
          const dataUrl = await packageViewerRef.current.captureScreenshot();
          blob = await (await fetch(dataUrl)).blob();
          filename = "package.jpg";
        } else {
          throw new Error("Viewer not available for screenshot");
        }
      } else if (type === "product") {
        blob = await downloadProductExport(format as "blend" | "stl" | "jpg");
        filename = `product.${format === "blend" ? "obj" : format}`;
      } else if (type === "package") {
        blob = await downloadPackageExport(format as "blend" | "stl" | "jpg");
        filename = `package.${format === "blend" ? "obj" : format}`;
      } else {
        blob = await downloadDielineExport(format as "pdf");
        filename = `dieline.${format}`;
      }

      triggerDownload(blob, filename);
    } catch {
      alert(`Failed to download ${type} ${format}. Please try again.`);
    } finally {
      setDownloading((previous) => ({ ...previous, [key]: false }));
    }
  };

  useEffect(() => {
    void updateCurrentProjectContext("/final-view").catch(() => {
      // Export view can open without a saved project.
    });
  }, []);

  useEffect(() => {
    const loadProduct = async () => {
      try {
        setProductLoading(true);
        const state = await getProductState();
        setProductState(state);

        const assetUrl =
          state.current_model_asset_url ??
          state.editor_state.current_model_url ??
          state.trellis_output?.model_file;
        const assetKey =
          state.active_version_id ??
          state.iterations.at(-1)?.id ??
          "latest";

        if (assetUrl) {
          const cachedUrl = await getCachedModelUrl(
            assetKey,
            assetUrl,
          );
          setProductModelUrl(cachedUrl);
        }
      } finally {
        setProductLoading(false);
      }
    };

    void loadProduct();
  }, []);

  useEffect(() => {
    const loadPackaging = async () => {
      try {
        setPackagingLoading(true);
        const state = await getPackagingState();
        const resolved = resolvePackagingModel(state);

        setPackageModel(resolved.model);
        setPanelTextures(
          await loadCachedPanelTextures(
            resolved.model,
            resolved.shapeState.panel_textures,
          ),
        );
      } finally {
        setPackagingLoading(false);
      }
    };

    void loadPackaging();
  }, []);

  return (
    <div className="h-screen bg-background flex flex-col overflow-hidden">
      <div className="flex-1 flex flex-col overflow-hidden">
        <div className="flex-1 relative bg-muted/30 min-h-0 flex flex-col">
          <div className="flex-1 w-full p-8 overflow-auto pb-32">
            <div className="max-w-5xl mx-auto h-full">
              <div className="grid grid-cols-2 gap-8 h-full">
                <div className="flex flex-col gap-4">
                  <div className="flex-1 bg-background rounded-lg border-2 border-black shadow-[6px_6px_0px_0px_rgba(0,0,0,1)] overflow-hidden min-h-[400px]">
                    {productLoading ? (
                      <div className="w-full h-full flex items-center justify-center">
                        <p className="text-muted-foreground text-sm">
                          Loading product...
                        </p>
                      </div>
                    ) : productModelUrl ? (
                      <ModelViewer
                        ref={productViewerRef}
                        modelUrl={productModelUrl}
                        autoRotate
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <p className="text-muted-foreground text-sm">
                          No product model available
                        </p>
                      </div>
                    )}
                  </div>

                  <div className="bg-background rounded-lg border-2 border-black shadow-[6px_6px_0px_0px_rgba(0,0,0,1)] px-4 pt-4 pb-4 mb-8">
                    <h3 className="font-bold text-sm mb-3 border-b-2 border-black pb-2">
                      Product
                    </h3>
                    <div className="space-y-2 mb-8">
                      {productDownloads.map((download) => {
                        const key = `product-${download.format}`;
                        const isDownloading = downloading[key];

                        return (
                          <button
                            key={download.format}
                            onClick={() =>
                              void handleDownload("product", download.format)
                            }
                            disabled={
                              isDownloading || !productState?.trellis_output?.model_file
                            }
                            className="w-full flex items-center justify-between gap-3 p-2 rounded-md border-2 border-black bg-card hover:bg-accent transition-all duration-200 hover:scale-[1.02] active:scale-95 group cursor-pointer shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100"
                          >
                            <span className="text-sm font-medium truncate">
                              {download.name}
                            </span>
                            {isDownloading ? (
                              <Loader2 className="w-4 h-4 flex-shrink-0 animate-spin" />
                            ) : (
                              <Download className="w-4 h-4 flex-shrink-0 transition-transform group-hover:-translate-y-1" />
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>

                <div className="flex flex-col gap-4">
                  <div className="flex-1 bg-background rounded-lg border-2 border-black shadow-[6px_6px_0px_0px_rgba(0,0,0,1)] overflow-hidden min-h-[400px]">
                    {packagingLoading ? (
                      <div className="w-full h-full flex items-center justify-center">
                        <p className="text-muted-foreground text-sm">
                          Loading package...
                        </p>
                      </div>
                    ) : packageModel ? (
                      <PackageViewer3D
                        ref={packageViewerRef}
                        model={packageModel}
                        panelTextures={panelTextures}
                        autoRotate
                        hideDielineHud
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <p className="text-muted-foreground text-sm">
                          No package model available
                        </p>
                      </div>
                    )}
                  </div>

                  <div className="bg-background rounded-lg border-2 border-black shadow-[6px_6px_0px_0px_rgba(0,0,0,1)] px-4 pt-4 pb-4 mb-8">
                    <h3 className="font-bold text-sm mb-3 border-b-2 border-black pb-2">
                      Package
                    </h3>
                    <div className="space-y-2 mb-4">
                      {packageDownloads.map((download) => {
                        const key = `package-${download.format}`;
                        const isDownloading = downloading[key];

                        return (
                          <button
                            key={download.format}
                            onClick={() =>
                              void handleDownload("package", download.format)
                            }
                            disabled={isDownloading || !packageModel}
                            className="w-full flex items-center justify-between gap-3 p-2 rounded-md border-2 border-black bg-card hover:bg-accent transition-all duration-200 hover:scale-[1.02] active:scale-95 group cursor-pointer shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100"
                          >
                            <span className="text-sm font-medium truncate">
                              {download.name}
                            </span>
                            {isDownloading ? (
                              <Loader2 className="w-4 h-4 flex-shrink-0 animate-spin" />
                            ) : (
                              <Download className="w-4 h-4 flex-shrink-0 transition-transform group-hover:-translate-y-1" />
                            )}
                          </button>
                        );
                      })}
                    </div>
                    <h3 className="font-bold text-sm mb-3 mt-4 border-b-2 border-black pb-2">
                      Dieline
                    </h3>
                    <div className="space-y-2">
                      {dielineDownloads.map((download) => {
                        const key = `dieline-${download.format}`;
                        const isDownloading = downloading[key];

                        return (
                          <button
                            key={download.format}
                            onClick={() =>
                              void handleDownload("dieline", download.format)
                            }
                            disabled={isDownloading || !packageModel}
                            className="w-full flex items-center justify-between gap-3 p-2 rounded-md border-2 border-black bg-card hover:bg-accent transition-all duration-200 hover:scale-[1.02] active:scale-95 group cursor-pointer shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100"
                          >
                            <span className="text-sm font-medium truncate">
                              {download.name}
                            </span>
                            {isDownloading ? (
                              <Loader2 className="w-4 h-4 flex-shrink-0 animate-spin" />
                            ) : (
                              <Download className="w-4 h-4 flex-shrink-0 transition-transform group-hover:-translate-y-1" />
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
