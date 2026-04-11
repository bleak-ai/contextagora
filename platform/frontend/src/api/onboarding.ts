import { apiFetch } from "./client";

export interface OnboardingState {
  modules_in_repo: number;
  modules_loaded: number;
  loaded_module_names: string[];
}

export function getOnboardingState(): Promise<OnboardingState> {
  return apiFetch<OnboardingState>("/onboarding/state");
}
