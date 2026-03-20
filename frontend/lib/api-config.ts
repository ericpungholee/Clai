const DEFAULT_API_ORIGIN = "http://127.0.0.1:8000";

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, "");
}

export function getApiBaseUrl(): string {
  const configuredOrigin = process.env.NEXT_PUBLIC_API_URL?.trim();
  if (configuredOrigin) {
    return trimTrailingSlash(configuredOrigin);
  }

  if (typeof window !== "undefined") {
    return `${window.location.protocol}//${window.location.hostname}:8000`;
  }

  return DEFAULT_API_ORIGIN;
}

export const API_ENDPOINTS = {
  get health() {
    return `${getApiBaseUrl()}/health`;
  },
  projects: {
    get list() {
      return `${getApiBaseUrl()}/projects`;
    },
    get current() {
      return `${getApiBaseUrl()}/projects/current`;
    },
    get create() {
      return `${getApiBaseUrl()}/projects`;
    },
    get save() {
      return `${getApiBaseUrl()}/projects/save`;
    },
    get: (projectId: string) => `${getApiBaseUrl()}/projects/${projectId}`,
    open: (projectId: string) => `${getApiBaseUrl()}/projects/${projectId}/open`,
    get updateContext() {
      return `${getApiBaseUrl()}/projects/current/context`;
    },
  },
  packaging: {
    get state() {
      return `${getApiBaseUrl()}/packaging/state`;
    },
    get status() {
      return `${getApiBaseUrl()}/packaging/status`;
    },
    get generate() {
      return `${getApiBaseUrl()}/packaging/panels/generate`;
    },
    get generateAll() {
      return `${getApiBaseUrl()}/packaging/panels/generate-all`;
    },
    getTexture: (panelId: string) =>
      `${getApiBaseUrl()}/packaging/panels/${panelId}/texture`,
    deleteTexture: (panelId: string) =>
      `${getApiBaseUrl()}/packaging/panels/${panelId}/texture`,
    get updateDimensions() {
      return `${getApiBaseUrl()}/packaging/update-dimensions`;
    },
    get resetCurrentShape() {
      return `${getApiBaseUrl()}/packaging/reset-current-shape`;
    },
    get clear() {
      return `${getApiBaseUrl()}/packaging/clear`;
    },
    get export() {
      return `${getApiBaseUrl()}/packaging/export`;
    },
    downloadExport: (format: "blend" | "stl" | "jpg") =>
      `${getApiBaseUrl()}/packaging/export/${format}`,
    get exportDieline() {
      return `${getApiBaseUrl()}/packaging/dieline/export`;
    },
    downloadDieline: (format: "pdf" | "svg" | "jpg") =>
      `${getApiBaseUrl()}/packaging/dieline/export/${format}`,
  },
  product: {
    get state() {
      return `${getApiBaseUrl()}/product/state`;
    },
    get status() {
      return `${getApiBaseUrl()}/product/status`;
    },
    get create() {
      return `${getApiBaseUrl()}/product/create`;
    },
    get refineConcepts() {
      return `${getApiBaseUrl()}/product/concepts/refine`;
    },
    get selectConcept() {
      return `${getApiBaseUrl()}/product/concepts/select`;
    },
    get generateReferences() {
      return `${getApiBaseUrl()}/product/references/generate`;
    },
    get generateDraft() {
      return `${getApiBaseUrl()}/product/draft/generate`;
    },
    get edit() {
      return `${getApiBaseUrl()}/product/edit`;
    },
    get editRegion() {
      return `${getApiBaseUrl()}/product/edit-region`;
    },
    get updateEditorState() {
      return `${getApiBaseUrl()}/product/editor-state`;
    },
    get recover() {
      return `${getApiBaseUrl()}/product/recover`;
    },
    recoverVersion: (versionId: string) =>
      `${getApiBaseUrl()}/product/recover-version/${versionId}`,
    rewind: (iterationIndex: number) =>
      `${getApiBaseUrl()}/product/rewind/${iterationIndex}`,
    get clear() {
      return `${getApiBaseUrl()}/product/clear`;
    },
    get export() {
      return `${getApiBaseUrl()}/product/export`;
    },
    downloadExport: (format: "blend" | "stl" | "jpg") =>
      `${getApiBaseUrl()}/product/export/${format}`,
  },
};

