"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ArrowRight, Boxes, FolderOpen } from "lucide-react";
import { useLoading } from "@/providers/LoadingProvider";
import { createProject, listProjects, openProject } from "@/lib/project-api";
import type { SavedProjectSummary } from "@/lib/project-types";
import { createProduct } from "@/lib/product-api";
import { Anta } from "next/font/google";

const anta = Anta({
  weight: "400",
  subsets: ["latin"],
  variable: "--font-anta",
});

export default function Home() {
  const router = useRouter();
  const { startLoading, stopLoading } = useLoading();
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const [prompt, setPrompt] = useState("");
  const [isFocused, setIsFocused] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [pathLengths, setPathLengths] = useState<number[]>([]);
  const pathRefs = useRef<(SVGPathElement | null)[]>([]);
  const [currentProductIndex, setCurrentProductIndex] = useState(0);
  const [isAnimating, setIsAnimating] = useState(false);
  const [projects, setProjects] = useState<SavedProjectSummary[]>([]);
  const [currentProjectId, setCurrentProjectId] = useState<string | null>(null);
  const [projectsLoading, setProjectsLoading] = useState(true);
  const [projectActionId, setProjectActionId] = useState<string | null>(null);

  const productIdeas = ["speaker", "bottle", "lamp", "mug", "headphones", "chair", "toy"];

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
    } catch (error) {
      console.error("Failed to load projects:", error);
      setProjects([]);
      setCurrentProjectId(null);
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
      await createProduct(prompt.trim(), 1);
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
          <span className={`inline-flex text-4xl ${anta.className} lowercase`}>
            <span>cl</span>
            <span className="text-white" style={{ WebkitTextStroke: "1.5px #000" }}>
              ai
            </span>
          </span>
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
          onClick={() => textareaRef.current?.focus()}
          >
            <div className="p-4 pb-0">
              <Textarea
                ref={textareaRef}
                placeholder="Describe the product you want to generate..."
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                onKeyDown={handleKeyDown}
                onFocus={() => setIsFocused(true)}
                onBlur={() => setIsFocused(false)}
                disabled={isGenerating}
                className="min-h-[100px] w-full resize-none border-0 focus-visible:ring-0 focus-visible:ring-offset-0 p-0 text-lg bg-transparent shadow-none"
              />
            </div>
            
            <div className="flex justify-end p-3 border-t-2 border-black bg-muted/30 cursor-default">
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

        <section
          className={`
            w-full max-w-6xl transition-all duration-500 ease-out delay-200
            ${isLoaded ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"}
          `}
        >
          <div className="mb-4 flex items-center justify-between gap-4">
            <h2 className="text-xl font-semibold">Projects</h2>
            <Button variant="outline" onClick={() => void loadProjects()} disabled={projectsLoading}>
              Refresh
            </Button>
          </div>

          {projectsLoading ? (
            <div className="flex items-center justify-center border-2 border-black bg-background p-8 shadow-[4px_4px_0_rgba(0,0,0,1)]">
              <div className="h-5 w-5 animate-spin rounded-full border-2 border-foreground/20 border-t-foreground" />
            </div>
          ) : projects.length ? (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {projects.map((project) => {
                const isOpening = projectActionId === project.project_id;

                return (
                  <article
                    key={project.project_id}
                    className="overflow-hidden border-2 border-black bg-background shadow-[4px_4px_0_rgba(0,0,0,1)]"
                  >
                    <div className="aspect-4/3 border-b-2 border-black bg-muted">
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
                        <div className="text-lg font-semibold">{project.name}</div>
                        {project.project_id === currentProjectId ? (
                          <span className="rounded-full border border-black bg-yellow-200 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide">
                            Current
                          </span>
                        ) : null}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {new Date(project.updated_at).toLocaleString()}
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
                            Open
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
              No projects yet.
            </div>
          )}
        </section>
      </div>
      </div>
    </div>
  );
}
