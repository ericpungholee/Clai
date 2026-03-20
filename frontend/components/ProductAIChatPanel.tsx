"use client";

import { useState } from "react";
import { Loader2, Sparkles, Wand2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { createProject } from "@/lib/project-api";
import { createProduct, editProduct } from "@/lib/product-api";
import { ProductState, ProductStatus } from "@/lib/product-types";

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

function hasBaseModel(state: ProductState | null): boolean {
  return Boolean(
    state?.current_model_asset_url ??
      state?.editor_state.current_model_url ??
      state?.trellis_output?.model_file ??
      state?.active_version_id,
  );
}

export function ProductAIChatPanel({
  productState,
  productStatus,
  onStateRefresh,
}: ProductAIChatPanelProps) {
  const [prompt, setPrompt] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const isBusy = Boolean(productState?.in_progress || submitting);
  const isCreateMode = !hasBaseModel(productState);
  const canSubmit = Boolean(prompt.trim()) && !isBusy;
  const progressValue = Math.min(productStatus?.progress || 0, 100);

  const handleSubmit = async () => {
    if (!canSubmit) {
      return;
    }

    try {
      setSubmitting(true);

      if (isCreateMode) {
        await createProject({
          prompt: prompt.trim(),
          lastRoute: "/product",
        });
        await createProduct(prompt.trim(), 1);
      } else {
        await editProduct({
          prompt: prompt.trim(),
          editType: "whole_product",
          targetScope: "whole_product",
        });
      }

      setPrompt("");
      await onStateRefresh();
    } catch (error) {
      alert(error instanceof Error ? error.message : "Product action failed.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex h-full flex-col gap-3">
      {productState?.in_progress && productStatus ? (
        <div className="space-y-2 rounded-xl border border-border bg-muted/40 p-4">
          <div className="flex items-center justify-between gap-3 text-sm font-medium">
            <div className="flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" />
              {isCreateMode ? "Generating" : "Updating"}
            </div>
            <div className="text-xs text-muted-foreground">{progressValue}%</div>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-border/60">
            <div
              className="h-full rounded-full bg-foreground transition-all duration-300"
              style={{ width: `${progressValue}%` }}
            />
          </div>
        </div>
      ) : null}

      <div className="space-y-3 rounded-xl border border-border bg-card p-4">
        <Textarea
          placeholder={
            isCreateMode
              ? "Describe the product you want to generate..."
              : "Describe the product change you want..."
          }
          value={prompt}
          onChange={(event) => setPrompt(event.target.value)}
          disabled={isBusy}
          className="min-h-[120px] resize-none text-sm"
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              void handleSubmit();
            }
          }}
        />

        <Button onClick={() => void handleSubmit()} disabled={!canSubmit} className="w-full">
          {isBusy ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Working
            </>
          ) : isCreateMode ? (
            <>
              <Sparkles className="mr-2 h-4 w-4" />
              Generate
            </>
          ) : (
            <>
              <Wand2 className="mr-2 h-4 w-4" />
              Apply
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
