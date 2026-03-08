import { fetchJson } from "@/lib/api-client";
import { API_ENDPOINTS } from "@/lib/api-config";
import { ProjectListResponse, SavedProjectSummary } from "@/lib/project-types";

export async function listProjects(): Promise<ProjectListResponse> {
  return fetchJson<ProjectListResponse>(API_ENDPOINTS.projects.list);
}

export async function getCurrentProject(): Promise<SavedProjectSummary | null> {
  return fetchJson<SavedProjectSummary | null>(API_ENDPOINTS.projects.current);
}

export async function createProject(input?: {
  name?: string;
  prompt?: string;
  lastRoute?: string;
  resetWorkspace?: boolean;
}): Promise<SavedProjectSummary | null> {
  const response = await fetchJson<{ project: SavedProjectSummary | null }>(
    API_ENDPOINTS.projects.create,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: input?.name,
        prompt: input?.prompt,
        last_route: input?.lastRoute ?? "/product",
        reset_workspace: input?.resetWorkspace ?? true,
      }),
    },
  );
  return response.project;
}

export async function saveCurrentProject(input?: {
  name?: string;
  lastRoute?: string;
}): Promise<SavedProjectSummary | null> {
  const response = await fetchJson<{ project: SavedProjectSummary | null }>(
    API_ENDPOINTS.projects.save,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: input?.name,
        last_route: input?.lastRoute,
      }),
    },
  );
  return response.project;
}

export async function openProject(projectId: string): Promise<SavedProjectSummary | null> {
  const response = await fetchJson<{ project: SavedProjectSummary | null }>(
    API_ENDPOINTS.projects.open(projectId),
    {
      method: "POST",
    },
  );
  return response.project;
}

export async function updateCurrentProjectContext(lastRoute: string): Promise<SavedProjectSummary | null> {
  const response = await fetchJson<{ updated: boolean; project: SavedProjectSummary | null }>(
    API_ENDPOINTS.projects.updateContext,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ last_route: lastRoute }),
    },
  );
  return response.project;
}
