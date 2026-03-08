"use client";

import React, {
  Suspense,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import { Canvas } from "@react-three/fiber";
import {
  Environment,
  OrbitControls,
  TransformControls,
  useGLTF,
} from "@react-three/drei";
import {
  OrbitControls as OrbitControlsImpl,
  TransformControls as TransformControlsImpl,
} from "three-stdlib";
import * as THREE from "three";

export type ModelViewerTool = "resize" | "move" | "rotate";

export interface ModelTransformState {
  position: [number, number, number];
  rotation: [number, number, number];
  scale: [number, number, number];
}

export interface ModelViewerRef {
  captureScreenshot: () => Promise<string>;
}

interface ModelViewerProps {
  modelUrl?: string;
  error?: string | null;
  lightingMode?: "studio" | "sunset" | "warehouse" | "forest";
  wireframe?: boolean;
  zoomAction?: "in" | "out" | null;
  autoRotate?: boolean;
  interactionMode?: "view" | "direct_edit";
  activeTool?: ModelViewerTool;
  showHandles?: boolean;
  initialTransform?: ModelTransformState;
  onTransformChange?: (transform: ModelTransformState) => void;
}

const DEFAULT_TRANSFORM: ModelTransformState = {
  position: [0, 0, 0],
  rotation: [0, 0, 0],
  scale: [1, 1, 1],
};

function cloneTransform(
  transform: ModelTransformState = DEFAULT_TRANSFORM,
): ModelTransformState {
  return {
    position: [...transform.position] as [number, number, number],
    rotation: [...transform.rotation] as [number, number, number],
    scale: [...transform.scale] as [number, number, number],
  };
}

function toTransformMode(tool: ModelViewerTool): "scale" | "translate" | "rotate" {
  if (tool === "move") {
    return "translate";
  }
  if (tool === "rotate") {
    return "rotate";
  }
  return "scale";
}

function ModelLoader({
  url,
  wireframe,
}: {
  url: string;
  wireframe: boolean;
}) {
  const { scene } = useGLTF(url);
  const clonedScene = scene.clone();

  useEffect(() => {
    clonedScene.traverse((child) => {
      if (child instanceof THREE.Mesh && child.material) {
        const materials = Array.isArray(child.material)
          ? child.material
          : [child.material];

        materials.forEach((material) => {
          if (
            material instanceof THREE.MeshStandardMaterial ||
            material instanceof THREE.MeshPhysicalMaterial
          ) {
            material.wireframe = wireframe;
            material.opacity = 1;
            material.transparent = false;
            material.needsUpdate = true;

            if (wireframe) {
              material.emissive = new THREE.Color("#60a5fa");
              material.emissiveIntensity = 0.2;
              material.color = new THREE.Color("#60a5fa");
            }
          }
        });
      }
    });
  }, [clonedScene, wireframe]);

  return <primitive object={clonedScene} />;
}

function ModelLoaderWrapper({
  url,
  wireframe,
}: {
  url: string;
  wireframe: boolean;
}) {
  return (
    <Suspense fallback={null}>
      <ModelLoader url={url} wireframe={wireframe} />
    </Suspense>
  );
}

function ErrorDisplay({ message }: { message: string }) {
  return (
    <div className="absolute inset-0 flex items-center justify-center bg-gray-800">
      <div className="px-8 text-center">
        <div className="mb-4">
          <svg
            className="mx-auto h-16 w-16 text-red-500"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 8v4m0 4h.01M21 12a9 9 0 0 1-18 0 9 9 0 0 1 18 0Z"
            />
          </svg>
        </div>
        <p className="mb-2 text-lg font-semibold text-red-400">Error</p>
        <p className="text-sm text-gray-400">{message}</p>
      </div>
    </div>
  );
}

function EditableScene({
  activeTool,
  initialTransform,
  interactionMode,
  modelUrl,
  orbitControlsRef,
  onTransformChange,
  showHandles,
  wireframe,
}: {
  activeTool: ModelViewerTool;
  initialTransform: ModelTransformState;
  interactionMode: "view" | "direct_edit";
  modelUrl: string;
  orbitControlsRef: React.RefObject<OrbitControlsImpl | null>;
  onTransformChange?: (transform: ModelTransformState) => void;
  showHandles: boolean;
  wireframe: boolean;
}) {
  const transformControlsRef = useRef<TransformControlsImpl>(null);
  const modelGroupRef = useRef<THREE.Group>(null);
  const [isDragging, setIsDragging] = useState(false);

  const emitTransformChange = useCallback(() => {
    const group = modelGroupRef.current;
    if (!group || !onTransformChange) {
      return;
    }

    onTransformChange({
      position: [group.position.x, group.position.y, group.position.z],
      rotation: [group.rotation.x, group.rotation.y, group.rotation.z],
      scale: [group.scale.x, group.scale.y, group.scale.z],
    });
  }, [onTransformChange]);

  useEffect(() => {
    const group = modelGroupRef.current;
    if (!group) {
      return;
    }

    group.position.set(...initialTransform.position);
    group.rotation.set(...initialTransform.rotation);
    group.scale.set(...initialTransform.scale);
    group.updateMatrixWorld();
    emitTransformChange();
  }, [emitTransformChange, initialTransform, modelUrl]);

  useEffect(() => {
    const controls = transformControlsRef.current;
    if (!controls || interactionMode !== "direct_edit") {
      return;
    }

    const typedControls = controls as unknown as {
      addEventListener: (
        type: string,
        listener: (event: { value?: boolean }) => void,
      ) => void;
      removeEventListener: (
        type: string,
        listener: (event: { value?: boolean }) => void,
      ) => void;
    };

    const handleDraggingChanged = (event: { value?: boolean }) => {
      setIsDragging(Boolean(event.value));
    };

    typedControls.addEventListener("dragging-changed", handleDraggingChanged);

    return () => {
      typedControls.removeEventListener("dragging-changed", handleDraggingChanged);
    };
  }, [interactionMode]);

  useEffect(() => {
    if (orbitControlsRef.current) {
      orbitControlsRef.current.enabled =
        interactionMode !== "direct_edit" || !isDragging;
    }
  }, [interactionMode, isDragging, orbitControlsRef]);

  const model = (
    <group ref={modelGroupRef}>
      <ModelLoaderWrapper url={modelUrl} wireframe={wireframe} />
    </group>
  );

  if (interactionMode !== "direct_edit") {
    return model;
  }

  return (
    <TransformControls
      ref={transformControlsRef}
      enabled={showHandles}
      mode={toTransformMode(activeTool)}
      size={0.9}
      onMouseUp={emitTransformChange}
      onObjectChange={emitTransformChange}
      showX={showHandles}
      showY={showHandles}
      showZ={showHandles}
    >
      {model}
    </TransformControls>
  );
}

const ModelViewer = React.forwardRef<ModelViewerRef, ModelViewerProps>(
  function ModelViewer(
    {
      modelUrl,
      error,
      lightingMode = "studio",
      wireframe = false,
      zoomAction,
      autoRotate = true,
      interactionMode = "view",
      activeTool = "resize",
      showHandles = false,
      initialTransform,
      onTransformChange,
    },
    ref,
    ) {
      const controlsRef = useRef<OrbitControlsImpl>(null);
      const canvasRef = useRef<HTMLCanvasElement | null>(null);
      const initialSceneTransform = useMemo(
        () => cloneTransform(initialTransform),
        [initialTransform],
      );

    useImperativeHandle(
      ref,
      () => ({
        captureScreenshot: async () => {
          if (!canvasRef.current) {
            throw new Error("Canvas not available");
          }

          return new Promise<string>((resolve, reject) => {
            canvasRef.current?.toBlob((blob) => {
              if (!blob) {
                reject(new Error("Failed to capture screenshot"));
                return;
              }

              const reader = new FileReader();
              reader.onloadend = () => resolve(reader.result as string);
              reader.onerror = reject;
              reader.readAsDataURL(blob);
            }, "image/jpeg", 0.95);
          });
        },
      }),
      [],
    );

    useEffect(() => {
      if (!zoomAction || !controlsRef.current) {
        return;
      }

      const currentDistance = controlsRef.current.getDistance();
      const newDistance =
        zoomAction === "in"
          ? Math.max(currentDistance * 0.8, 2)
          : Math.min(currentDistance * 1.2, 10);

      controlsRef.current.minDistance = newDistance;
      controlsRef.current.maxDistance = newDistance;
      controlsRef.current.update();

      const timer = setTimeout(() => {
        if (controlsRef.current) {
          controlsRef.current.minDistance = 2;
          controlsRef.current.maxDistance = 10;
        }
      }, 100);

      return () => clearTimeout(timer);
    }, [zoomAction]);

    if (!modelUrl && !error) {
      return <div className="relative h-full w-full overflow-hidden bg-muted/30" />;
    }

    return (
      <div className="relative h-full w-full overflow-hidden">
        <Canvas
          key="product-viewer-canvas"
          camera={{ position: [1.5, 1, 2.5], fov: 45 }}
          className="h-full w-full"
          frameloop="always"
          gl={{
            toneMapping: 2,
            toneMappingExposure: 2.0,
            preserveDrawingBuffer: true,
            powerPreference: "high-performance",
            antialias: true,
          }}
          onCreated={({ gl }) => {
            canvasRef.current = gl.domElement;
          }}
        >
          <color attach="background" args={["#ffffff"]} />

          <Suspense fallback={null}>
            <Environment preset={lightingMode} background={false} />
            <ambientLight intensity={1.5} />
            <directionalLight position={[5, 5, 5]} intensity={2.4} castShadow />
            <directionalLight position={[-5, 3, -5]} intensity={0.9} />

            {modelUrl ? (
              <EditableScene
                activeTool={activeTool}
                initialTransform={initialSceneTransform}
                interactionMode={interactionMode}
                modelUrl={modelUrl}
                orbitControlsRef={controlsRef}
                onTransformChange={onTransformChange}
                showHandles={showHandles}
                wireframe={wireframe}
              />
            ) : null}

            <OrbitControls
              ref={controlsRef}
              autoRotate={autoRotate}
              autoRotateSpeed={1.5}
              dampingFactor={0.05}
              enableDamping
              maxDistance={10}
              minDistance={2}
            />
          </Suspense>
        </Canvas>

        {error ? <ErrorDisplay message={error} /> : null}
      </div>
    );
  },
);

export default ModelViewer;
