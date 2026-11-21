// Maps runtime cases to GLB assets. Visual review candidates remain available
// through the explicit review route; production changes use scripts/deploy.sh.
export const BOOT_MODEL = 'ana_clasica';

const ANIMATED_CANDIDATE_MODELS = Object.freeze({
  clara_cefaleia: 'candidates/clara_cefaleia_walk_v001',
  nelson_infarto: 'candidates/nelson_infarto_walkidle_gait_candidate_v001',
  paulo_dor_lombar: 'candidates/paulo_dor_lombar_walkidle_gait_candidate_v001',
  joao_queimacao: 'candidates/joao_queimacao_walkidle_gait_candidate_v007',
  helena_avc: 'candidates/helena_avc_walkidle_gait_candidate_v001',
  dona_rosa_hipotensao: 'candidates/rosa_hipotensao_walkidle_gait_candidate_v001',
  carlos_asma: 'candidates/carlos_asma_mixamo_prepared_v010_lod100k_bindframe',
  bia_apendicite: 'candidates/bia_apendicite_voxel_mixamo_walkidle_candidate_v023_arm_rebase_v001',
  carla_dengue: 'candidates/carla_dengue_voxel_mixamo_walkidle_candidate_v009_arm_rebase_v003',
  roberto_dispepsia: 'candidates/roberto_dispepsia_voxel_mixamo_walkidle_candidate_v006_arm_rebase_v001',
  catia_dermatite: 'candidates/catia_dermatite_voxel_mixamo_walkidle_candidate_v004_arm_rebase_v001',
});

export const CASE_MODELS = Object.freeze({
  marina_amoxicilina: 'candidates/marina_patient_v001',
  jose_gripe: 'candidates/jose_patient_v002',
  ...ANIMATED_CANDIDATE_MODELS,
});

// Retained for the opt-in review gallery and direct candidateCase route.
export const REVIEW_CANDIDATE_MODELS = ANIMATED_CANDIDATE_MODELS;

// The active Mariana case uses the first rendered, already approved Marina
// avatar selected by the user. Keep Carla's in-review model available to the
// explicit candidate-review route.
const ACTIVE_CASE_MODEL_OVERRIDES = Object.freeze({
  carla_dengue: 'candidates/marina_patient_v001',
});

export const modelForCaseId = (caseId, { includeReviewCandidates = false } = {}) => includeReviewCandidates
  ? REVIEW_CANDIDATE_MODELS[caseId] || CASE_MODELS[caseId] || BOOT_MODEL
  : ACTIVE_CASE_MODEL_OVERRIDES[caseId] || CASE_MODELS[caseId] || BOOT_MODEL;
