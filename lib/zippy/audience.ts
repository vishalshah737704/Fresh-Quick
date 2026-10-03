export type ZippyRole = "customer" | "vendor" | "delivery" | "admin";

// Visitors see the same guides as customers (they are about to become one);
// every other role sees shared content plus only its own guides.
export function audiencesFor(role: ZippyRole | null): string[] {
  if (role === null || role === "customer") return ["all", "customer"];
  return ["all", role];
}
