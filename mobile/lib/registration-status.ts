import { apiPostPublic } from "./api";
import { parseStatusAnswer, type RegistrationStatusAnswer } from "./registration-model";

// Why was this login refused? null means the lookup failed or answered something unexpected;
// the caller then shows the friendly fallback, never the raw sign-in error.
export async function fetchRegistrationStatus(email: string): Promise<RegistrationStatusAnswer | null> {
  try {
    return parseStatusAnswer(await apiPostPublic<unknown>("/api/auth/registration-status", { email }));
  } catch {
    return null;
  }
}
