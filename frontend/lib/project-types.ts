export interface SavedProjectSummary {
  project_id: string;
  name: string;
  prompt?: string;
  last_route: string;
  created_at: string;
  updated_at: string;
  workflow_stage: string;
  status_label: string;
  preview_image?: string;
  selected_concept_title?: string;
  has_product_model: boolean;
  has_packaging: boolean;
}

export interface ProjectListResponse {
  projects: SavedProjectSummary[];
  current_project_id?: string | null;
}
