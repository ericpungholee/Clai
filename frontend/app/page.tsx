"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ArrowRight, Boxes, FolderOpen, Upload, X } from "lucide-react";
import { useLoading } from "@/providers/LoadingProvider";
import { createProject, listProjects, openProject } from "@/lib/project-api";
import type { SavedProjectSummary } from "@/lib/project-types";
import { createProduct } from "@/lib/product-api";
import { Bungee } from "next/font/google";

const bungee = Bungee({
  weight: "400",
  subsets: ["latin"],
  variable: "--font-bungee",
});

export default function Home() {
  const router = useRouter();
  const { startLoading, stopLoading } = useLoading();
  const [prompt, setPrompt] = useState("");
  const [isFocused, setIsFocused] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [pathLengths, setPathLengths] = useState<number[]>([]);
  const pathRefs = useRef<(SVGPathElement | null)[]>([]);
  const [images, setImages] = useState<string[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [currentProductIndex, setCurrentProductIndex] = useState(0);
  const [isAnimating, setIsAnimating] = useState(false);
  const [projects, setProjects] = useState<SavedProjectSummary[]>([]);
  const [currentProjectId, setCurrentProjectId] = useState<string | null>(null);
  const [projectsLoading, setProjectsLoading] = useState(true);
  const [projectActionId, setProjectActionId] = useState<string | null>(null);

  const productIdeas = ["Labubu", "Lego", "ball", "hat", "mug", "chair", "pillow"];

  useEffect(() => {
    // Measure all paths
    if (pathRefs.current.length > 0) {
      const lengths = pathRefs.current.map(path => path?.getTotalLength() || 0);
      setPathLengths(lengths);
      
      // Only start animation after we've measured
      const timer = setTimeout(() => setIsLoaded(true), 100);
      return () => clearTimeout(timer);
    }
  }, []);

  // Rotate through product ideas
  useEffect(() => {
    if (!isLoaded) return;
    
    const interval = setInterval(() => {
      setIsAnimating(true);
      setTimeout(() => {
        setCurrentProductIndex((prev) => (prev + 1) % productIdeas.length);
        setIsAnimating(false);
      }, 300); // Half of transition duration
    }, 2000); // Change every 2 seconds

    return () => clearInterval(interval);
  }, [isLoaded, productIdeas.length]);

  const loadProjects = useCallback(async () => {
    try {
      setProjectsLoading(true);
      const response = await listProjects();
      setProjects(response.projects ?? []);
      setCurrentProjectId(response.current_project_id ?? null);
    } finally {
      setProjectsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadProjects();
  }, [loadProjects]);

  const handleStart = async () => {
    if (!prompt.trim()) return;
    
    setIsGenerating(true);
  	startLoading();

    try {
      await createProject({
        prompt: prompt.trim(),
        lastRoute: "/product",
      });
      await createProduct(prompt.trim(), 4);
      router.push("/product");
    } catch (error) {
      console.error("Generation failed:", error);
      setIsGenerating(false);
  	  stopLoading();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleStart();
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      Array.from(e.target.files).forEach(file => {
        if (file.type.startsWith('image/')) {
          const reader = new FileReader();
          reader.onload = (event) => {
            if (event.target?.result) {
              setImages(prev => [...prev, event.target!.result as string]);
            }
          };
          reader.readAsDataURL(file);
        }
      });
      // Reset input so the same files can be selected again
      e.target.value = '';
    }
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    const items = e.clipboardData.items;
    for (let i = 0; i < items.length; i++) {
      if (items[i].type.indexOf('image') !== -1) {
        const file = items[i].getAsFile();
        if (file) {
          const reader = new FileReader();
          reader.onload = (e) => {
            if (e.target?.result) {
              setImages(prev => [...prev, e.target!.result as string]);
            }
          };
          reader.readAsDataURL(file);
        }
      }
    }
  };

  const removeImage = (index: number) => {
    setImages(prev => prev.filter((_, i) => i !== index));
  };

  const handleOpenProject = useCallback(
    async (project: SavedProjectSummary) => {
      try {
        setProjectActionId(project.project_id);
        startLoading();
        await openProject(project.project_id);
        router.push(project.last_route || "/product");
      } catch (error) {
        console.error("Failed to open project:", error);
        stopLoading();
      } finally {
        setProjectActionId(null);
      }
    },
    [router, startLoading, stopLoading],
  );

  const suggestions = [
    { text: "Create a Lego Donkey Kong Labubu" },
    { text: "Design a blue water bottle" },
    { text: "Generate a red lego block" },
  ];

  const logoPaths = [
     "M2.97 12.92A2 2 0 0 0 2 14.63v3.24a2 2 0 0 0 .97 1.71l3 1.8a2 2 0 0 0 2.06 0L12 19v-5.5l-5-3-4.03 2.42Z",
     "m7 16.5-4.74-2.85",
     "m7 16.5 5-3",
     "M7 16.5v5.17",
     "M12 13.5V19l3.97 2.38a2 2 0 0 0 2.06 0l3-1.8a2 2 0 0 0 .97-1.71v-3.24a2 2 0 0 0-.97-1.71L17 10.5l-5 3Z",
     "m17 16.5-5-3",
     "m17 16.5 4.74-2.85",
     "M17 16.5v5.17",
     "M7.97 4.42A2 2 0 0 0 7 6.13v4.37l5 3 5-3V6.13a2 2 0 0 0-.97-1.71l-3-1.8a2 2 0 0 0-2.06 0l-3 1.8Z",
     "M12 8 7.26 5.15",
     "m12 8 4.74-2.85",
     "M12 13.5V8"
  ];

  return (
    <div className="relative min-h-full overflow-y-auto px-4 pb-12 pt-8 md:px-8">
      <div className="mx-auto flex w-full max-w-6xl flex-col items-center">
      
      {/* Loading Overlay (managed globally via provider now, but we keep state for button disabled) */}
      
      {/* Background Logo Vector Animation */}
      <div className={`
        absolute inset-0 flex items-center justify-center z-0 pointer-events-none
        transition-opacity duration-900 ease-out delay-100
        ${isLoaded ? "opacity-100" : "opacity-0"}
      `}>
        <svg 
          viewBox="0 0 24 24" 
          fill="none" 
          stroke="currentColor" 
          strokeWidth="0.1"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="w-full h-full text-foreground opacity-20"
        >
          {logoPaths.map((d, i) => (
            <path 
              key={i}
              ref={el => { pathRefs.current[i] = el; }}
              d={d}
              style={{
                strokeDasharray: pathLengths[i] || 0,
                strokeDashoffset: isLoaded ? 0 : (pathLengths[i] || 0),
                transition: isLoaded ? "stroke-dashoffset 0.6s cubic-bezier(0.2, 0, 0.1, 1) 0.1s" : "none",
                opacity: pathLengths.length > 0 ? 1 : 0
              }}
            />
          ))}
        </svg>
      </div>

      {/* Top Logo */}
      <div className={` 
        absolute top-8 left-8 z-10
        transition-all duration-300 ease-out
        ${isLoaded ? "opacity-100 translate-y-0" : "opacity-0 -translate-y-2"}
      `}>
        <div className="flex items-center gap-3">
          <Boxes className="w-10 h-10" />
          <span className={`text-3xl ${bungee.className} lowercase`}>vril</span>
        </div>
      </div>

      {/* Main Content - Staggered Fade In with Scale */}
      <div className="relative z-10 flex w-full flex-col items-center space-y-8 pt-20">
        
        <div className={`
          space-y-2 text-center mb-4
          transition-all duration-500 ease-out
          ${isLoaded ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"}
        `}>
          <h1 className="text-4xl md:text-5xl font-bold tracking-tight relative inline-block">
            Build a{" "}
            <span 
              className={`inline-block w-[160px] text-left transition-all duration-500 ease-in-out ${
                isAnimating ? "opacity-0 translate-y-2" : "opacity-100 translate-y-0"
              }`}
            >
              {productIdeas[currentProductIndex]}
            </span>
          </h1>
          <p className="text-muted-foreground text-lg">
            Describe your product idea and let AI visualize it for you.
          </p>
        </div>

        <div 
          className={`
            w-full max-w-2xl relative group
            transition-all duration-500 ease-out delay-100
            ${isLoaded ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"}
          `}
        >
          <div className={`
            relative bg-background rounded-xl border-2 border-black overflow-hidden cursor-pointer
            transition-all duration-300 ease-out
            ${isFocused 
              ? "scale-[1.005] shadow-[5px_5px_0px_0px_rgba(0,0,0,1)] -translate-y-px -translate-x-px" 
              : "scale-100 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]"}
          `}
          onClick={() => document.querySelector<HTMLTextAreaElement>('textarea')?.focus()}
          >
            <div className="p-4 pb-0">
              {images.length > 0 && (
                <div className="flex flex-wrap gap-2 mb-2">
                  {images.map((img, index) => (
                    <div key={index} className="relative group/image">
                      <img 
                        src={img} 
                        alt={`Attachment ${index + 1}`} 
                        className="h-16 w-16 object-cover rounded-md border border-black/20"
                      />
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          removeImage(index);
                        }}
                        className="absolute -top-2 -right-2 bg-background text-foreground border-2 border-black rounded-full p-1 
                                   opacity-0 group-hover/image:opacity-100 transition-all duration-200 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] cursor-pointer hover:scale-110 active:scale-95"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
              <Textarea
                placeholder="I want a hexagonal box for organic tea..."
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                onKeyDown={handleKeyDown}
                onPaste={handlePaste}
                onFocus={() => setIsFocused(true)}
                onBlur={() => setIsFocused(false)}
                disabled={isGenerating}
                className="min-h-[100px] w-full resize-none border-0 focus-visible:ring-0 focus-visible:ring-offset-0 p-0 text-lg bg-transparent shadow-none"
              />
            </div>
            
            <div className="flex items-center justify-between p-3 border-t-2 border-black bg-muted/30 cursor-default">
              <div className="flex gap-2">
                <input 
                  type="file" 
                  ref={fileInputRef}
                  onChange={handleFileSelect}
                  className="hidden" 
                  accept="image/*"
                  multiple
                />
                <Button 
                  variant="outline" 
                  size="icon" 
                  className="h-9 w-9 rounded-lg border-black hover:bg-secondary transition-colors duration-200 cursor-pointer" 
                  title="Upload reference image"
                  onClick={(e) => {
                    e.stopPropagation();
                    fileInputRef.current?.click();
                  }}
                >
                  <Upload className="w-4 h-4" />
                </Button>
              </div>
              
              <Button 
                onClick={(e) => {
                  e.stopPropagation();
                  handleStart();
                }}
                disabled={!prompt.trim() || isGenerating}
                className={`
                  transition-all duration-300 cursor-pointer
                  ${prompt.trim() && !isGenerating ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}
                `}
              >
                {isGenerating ? "Generating..." : "Generate"}
                {!isGenerating && <ArrowRight className="w-4 h-4 ml-2" />}
              </Button>
            </div>
          </div>
        </div>

        <div className={`
          flex flex-wrap justify-center gap-3 mt-8 
          transition-all duration-300 ease-out delay-200
          ${isLoaded ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"}
        `}>
          {suggestions.map((suggestion, i) => (
            <button
              key={i}
              onClick={() => setPrompt(suggestion.text)}
              className="flex items-center gap-2 px-4 py-2 text-sm bg-background border-2 border-black rounded-full 
                         hover:bg-secondary hover:scale-[1.02] active:scale-[0.98] transition-all duration-200 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] cursor-pointer"
            >
              {suggestion.text}
            </button>
          ))}
        </div>

        <section
          className={`
            w-full max-w-6xl transition-all duration-500 ease-out delay-200
            ${isLoaded ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"}
          `}
        >
          <div className="mb-4 flex items-center justify-between gap-4">
            <div>
              <div className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground">
                Saved Projects
              </div>
              <h2 className="mt-2 text-2xl font-semibold">Resume from the home page</h2>
            </div>
            <Button variant="outline" onClick={() => void loadProjects()} disabled={projectsLoading}>
              Refresh
            </Button>
          </div>

          {projectsLoading ? (
            <div className="border-2 border-black bg-background p-8 text-sm text-muted-foreground shadow-[4px_4px_0_rgba(0,0,0,1)]">
              Loading saved projects...
            </div>
          ) : projects.length ? (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {projects.map((project) => {
                const isOpening = projectActionId === project.project_id;
                const resumeLabel =
                  project.last_route === "/packaging"
                    ? "Resume Packaging"
                    : project.last_route === "/final-view"
                      ? "Open Final View"
                      : "Resume Product";

                return (
                  <article
                    key={project.project_id}
                    className="overflow-hidden border-2 border-black bg-background shadow-[4px_4px_0_rgba(0,0,0,1)]"
                  >
                    <div className="aspect-[4/3] border-b-2 border-black bg-muted">
                      {project.preview_image ? (
                        <img
                          src={project.preview_image}
                          alt={project.name}
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                          No preview yet
                        </div>
                      )}
                    </div>
                    <div className="space-y-4 p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="text-lg font-semibold">{project.name}</div>
                          <div className="mt-1 text-xs text-muted-foreground">
                            {project.selected_concept_title ?? project.prompt ?? "Untitled project"}
                          </div>
                        </div>
                        {project.project_id === currentProjectId ? (
                          <span className="rounded-full border border-black bg-yellow-200 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide">
                            Current
                          </span>
                        ) : null}
                      </div>

                      <div className="flex flex-wrap gap-2 text-[11px] uppercase tracking-wide text-muted-foreground">
                        <span className="rounded-full border border-black bg-secondary px-2 py-1">
                          {project.status_label}
                        </span>
                        <span className="rounded-full border border-black bg-secondary px-2 py-1">
                          {project.workflow_stage.replace(/_/g, " ")}
                        </span>
                      </div>

                      <div className="space-y-1 text-xs text-muted-foreground">
                        <div>Updated {new Date(project.updated_at).toLocaleString()}</div>
                        <div>{project.has_packaging ? "Packaging saved" : "Product-only so far"}</div>
                      </div>

                      <Button
                        className="w-full"
                        disabled={isOpening}
                        onClick={() => void handleOpenProject(project)}
                      >
                        {isOpening ? (
                          <>
                            <div className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                            Opening...
                          </>
                        ) : (
                          <>
                            <FolderOpen className="mr-2 h-4 w-4" />
                            {resumeLabel}
                          </>
                        )}
                      </Button>
                    </div>
                  </article>
                );
              })}
            </div>
          ) : (
            <div className="border-2 border-dashed border-black bg-background p-8 text-sm text-muted-foreground shadow-[4px_4px_0_rgba(0,0,0,1)]">
              No saved projects yet. Start with a prompt, then save from the workspace and it will appear here.
            </div>
          )}
        </section>
      </div>
      </div>
    </div>
  );
}
