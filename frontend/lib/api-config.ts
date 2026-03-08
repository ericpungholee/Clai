export const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";

export const API_ENDPOINTS = {
  health: `${API_BASE_URL}/health`,
  projects: {
    list: `${API_BASE_URL}/projects`,
    current: `${API_BASE_URL}/projects/current`,
    create: `${API_BASE_URL}/projects`,
    save: `${API_BASE_URL}/projects/save`,
    get: (projectId: string) => `${API_BASE_URL}/projects/${projectId}`,
    open: (projectId: string) => `${API_BASE_URL}/projects/${projectId}/open`,
    updateContext: `${API_BASE_URL}/projects/current/context`,
  },
  packaging: {
    state: `${API_BASE_URL}/packaging/state`,
    status: `${API_BASE_URL}/packaging/status`,
    generate: `${API_BASE_URL}/packaging/panels/generate`,
    generateAll: `${API_BASE_URL}/packaging/panels/generate-all`,
    getTexture: (panelId: string) =>
      `${API_BASE_URL}/packaging/panels/${panelId}/texture`,
    deleteTexture: (panelId: string) =>
      `${API_BASE_URL}/packaging/panels/${panelId}/texture`,
    updateDimensions: `${API_BASE_URL}/packaging/update-dimensions`,
    resetCurrentShape: `${API_BASE_URL}/packaging/reset-current-shape`,
    clear: `${API_BASE_URL}/packaging/clear`,
    export: `${API_BASE_URL}/packaging/export`,
    downloadExport: (format: "blend" | "stl" | "jpg") =>
      `${API_BASE_URL}/packaging/export/${format}`,
    exportDieline: `${API_BASE_URL}/packaging/dieline/export`,
    downloadDieline: (format: "pdf" | "svg" | "jpg") =>
      `${API_BASE_URL}/packaging/dieline/export/${format}`,
  },
  product: {
    state: `${API_BASE_URL}/product/state`,
    status: `${API_BASE_URL}/product/status`,
    create: `${API_BASE_URL}/product/create`,
    refineConcepts: `${API_BASE_URL}/product/concepts/refine`,
    selectConcept: `${API_BASE_URL}/product/concepts/select`,
    generateReferences: `${API_BASE_URL}/product/references/generate`,
    generateDraft: `${API_BASE_URL}/product/draft/generate`,
    edit: `${API_BASE_URL}/product/edit`,
    editRegion: `${API_BASE_URL}/product/edit-region`,
    updateEditorState: `${API_BASE_URL}/product/editor-state`,
    recover: `${API_BASE_URL}/product/recover`,
    recoverVersion: (versionId: string) =>
      `${API_BASE_URL}/product/recover-version/${versionId}`,
    rewind: (iterationIndex: number) =>
      `${API_BASE_URL}/product/rewind/${iterationIndex}`,
    clear: `${API_BASE_URL}/product/clear`,
    export: `${API_BASE_URL}/product/export`,
    downloadExport: (format: "blend" | "stl" | "jpg") =>
      `${API_BASE_URL}/product/export/${format}`,
  },
};

