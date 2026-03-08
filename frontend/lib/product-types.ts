export type WorkflowStage =
  | "idle"
  | "brief_ready"
  | "concepts_ready"
  | "references_ready"
  | "draft_ready"
  | "editing"
  | "error";

export type ProductMode = "idle" | "create" | "edit";
export type EditorInteractionMode = "view" | "direct_edit";
export type EditorTool = "resize" | "move" | "rotate";

export type ReferenceRole =
  | "sketch"
  | "hero"
  | "ortho_front"
  | "ortho_side"
  | "detail";

export type OperationType =
  | "create_brief"
  | "generate_concepts"
  | "refine_concepts"
  | "choose_concept"
  | "generate_references"
  | "generate_3d_draft"
  | "edit_whole_product"
  | "edit_region"
  | "restyle_materials"
  | "rewind_version"
  | "recover_prior_result";

export type OperationState = "pending" | "running" | "complete" | "error";

export interface TrellisArtifacts {
  model_file?: string;
  color_video?: string;
  gaussian_ply?: string;
  normal_video?: string;
  combined_video?: string;
  no_background_images: string[];
}

export interface DesignBrief {
  product_name: string;
  category: string;
  target_user: string;
  primary_use_case: string;
  key_features: string[];
  style_keywords: string[];
  materials: string[];
  size_class: string;
  ergonomic_goals: string[];
  manufacturing_hints: string[];
  constraints: string[];
  must_have: string[];
  avoid: string[];
  uncertainty_flags: string[];
}

export interface ConceptDirection {
  concept_id: string;
  title: string;
  concept_image_url?: string;
  summary: string;
  silhouette: string;
  form_language: string;
  materials: string[];
  aesthetic_keywords: string[];
  key_differentiators: string[];
  pros: string[];
  risks: string[];
  confidence: number;
}

export interface ReferenceImage {
  role: ReferenceRole;
  url: string;
  prompt: string;
  generated_at: string;
}

export interface ReferenceSet {
  reference_set_id: string;
  concept_id: string;
  images: ReferenceImage[];
  created_at: string;
  metadata: Record<string, unknown>;
}

export interface RegionMetadata {
  region_id: string;
  label: string;
  description: string;
  confidence: number;
}

export interface AIOperation {
  operation_id: string;
  type: OperationType;
  status: OperationState;
  input_prompt?: string;
  target_scope: string;
  created_at: string;
  completed_at?: string;
  artifact_ids: string[];
  error?: string;
  summary?: string;
}

export interface DesignVersion {
  version_id: string;
  parent_version_id?: string;
  source_operation_id?: string;
  source_prompt?: string;
  concept_id?: string;
  model_asset_url?: string;
  preview_images: string[];
  created_at: string;
  summary_of_changes: string;
  named_regions: RegionMetadata[];
  provenance: Record<string, unknown>;
}

export interface ProductEditorState {
  current_model_url?: string;
  active_version_id?: string;
  interaction_mode: EditorInteractionMode;
  handles_visible: boolean;
  active_tool: EditorTool;
  transform: {
    position: [number, number, number];
    rotation: [number, number, number];
    scale: [number, number, number];
  };
  camera_presets: Record<string, Record<string, number>>;
  selected_part_id?: string;
  material_assignments: Record<string, string>;
  annotations: string[];
  ai_region_labels: RegionMetadata[];
  provenance: Record<string, unknown>;
}

export interface ProductIteration {
  id: string;
  type: "create" | "edit";
  prompt: string;
  images: string[];
  trellis_output?: TrellisArtifacts;
  created_at: string;
  note?: string;
  duration_seconds?: number;
  source_operation_id?: string;
  version_id?: string;
  concept_id?: string;
}

export interface ProductState {
  prompt?: string;
  latest_instruction?: string;
  mode: ProductMode;
  status: string;
  message?: string;
  workflow_stage: WorkflowStage;
  last_completed_stage: WorkflowStage;
  in_progress: boolean;
  generation_started_at?: string;
  image_count: number;
  images: string[];
  trellis_output?: TrellisArtifacts;
  iterations: ProductIteration[];
  design_brief?: DesignBrief;
  concept_directions: ConceptDirection[];
  selected_concept_id?: string;
  reference_set?: ReferenceSet;
  ai_operations: AIOperation[];
  version_history: DesignVersion[];
  active_version_id?: string;
  current_model_asset_url?: string;
  named_regions: RegionMetadata[];
  editor_state: ProductEditorState;
  last_error?: string;
  created_at: string;
  updated_at: string;
  export_files?: Record<string, string>;
}

export interface ProductStatus {
  status: string;
  progress: number;
  message?: string;
  error?: string;
  workflow_stage: WorkflowStage;
  active_operation_id?: string;
  active_operation_type?: OperationType;
  active_version_id?: string;
  model_file?: string;
  preview_image?: string;
  updated_at: string;
}
