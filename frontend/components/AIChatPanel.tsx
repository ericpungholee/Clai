"use client";

import {
  PackagingAIChatPanel,
  PackagingAIChatPanelProps,
} from "@/components/PackagingAIChatPanel";
import {
  ProductAIChatPanel,
  ProductAIChatPanelProps,
} from "@/components/ProductAIChatPanel";

export type AIChatPanelProps =
  | ProductAIChatPanelProps
  | PackagingAIChatPanelProps;

function isProductAIChatPanelProps(
  props: AIChatPanelProps,
): props is ProductAIChatPanelProps {
  return "productState" in props;
}

export function AIChatPanel(props: AIChatPanelProps) {
  return isProductAIChatPanelProps(props) ? (
    <ProductAIChatPanel {...props} />
  ) : (
    <PackagingAIChatPanel {...props} />
  );
}
