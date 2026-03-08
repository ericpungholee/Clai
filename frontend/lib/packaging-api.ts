import { fetchBlob, fetchJson, fetchOk } from "@/lib/api-client";
import { API_ENDPOINTS } from "@/lib/api-config";
import {
  PackageDimensions,
  PackagingState,
  PackagingStatus,
  PackageType,
} from "@/lib/packaging-types";

export async function getPackagingState(): Promise<PackagingState> {
  return fetchJson<PackagingState>(API_ENDPOINTS.packaging.state);
}

export async function updatePackagingDimensions(
  packageType: PackageType,
  dimensions: PackageDimensions,
): Promise<void> {
  await fetchOk(API_ENDPOINTS.packaging.updateDimensions, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ package_type: packageType, dimensions }),
  });
}

export async function getPackagingStatus(): Promise<PackagingStatus> {
  return fetchJson<PackagingStatus>(API_ENDPOINTS.packaging.status);
}

export async function resetCurrentShape(): Promise<{
  message: string;
  package_type: string;
  dimensions: Record<string, number>;
}> {
  return fetchJson(API_ENDPOINTS.packaging.resetCurrentShape, {
    method: "POST",
  });
}

export async function clearPackagingState(): Promise<void> {
  await fetchOk(API_ENDPOINTS.packaging.clear, {
    method: "POST",
  });
}

export async function exportPackageFormats(): Promise<{
  status: string;
  files: Record<string, string>;
}> {
  return fetchJson(API_ENDPOINTS.packaging.export, {
    method: "POST",
  });
}

export async function downloadPackageExport(
  format: "blend" | "stl" | "jpg",
): Promise<Blob> {
  return fetchBlob(API_ENDPOINTS.packaging.downloadExport(format));
}

export async function exportDielineFormats(): Promise<{
  status: string;
  files: Record<string, string>;
}> {
  return fetchJson(API_ENDPOINTS.packaging.exportDieline, {
    method: "POST",
  });
}

export async function downloadDielineExport(format: "pdf"): Promise<Blob> {
  return fetchBlob(API_ENDPOINTS.packaging.downloadDieline(format));
}
