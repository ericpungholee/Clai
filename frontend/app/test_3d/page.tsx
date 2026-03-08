"use client";

import TestModelViewer from "@/components/TestModelViewer";

export default function Test3DPage() {
  return (
    <div className="w-screen h-screen overflow-hidden">
      <TestModelViewer
        modelUrl="/test_model.glb"
        isLoading={false}
        error={null}
      />
    </div>
  );
}

