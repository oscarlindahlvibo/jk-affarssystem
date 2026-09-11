import { useAuth } from "./auth";
import { can, canEditProjectFinance, isAdmin, type Action, type Resource } from "./permissions";

export function usePermissions() {
  const { currentProfile } = useAuth();
  const role = currentProfile?.role ?? null;

  return {
    role,
    isAdmin: isAdmin(role),
    can: (resource: Resource, action: Action) => can(role, resource, action),
    canEditProjectFinance: canEditProjectFinance(role),
  };
}
