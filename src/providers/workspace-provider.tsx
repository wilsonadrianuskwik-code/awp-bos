"use client";

import { createContext, useContext, useCallback } from "react";
import { hasMinRole, type Role } from "@/lib/constants/roles";
import type { WorkspaceDocumentSettings } from "@/features/templates/types";

type Workspace = {
  id: string;
  name: string;
  slug: string;
  logo_url: string | null;
  default_currency: string;
  settings: WorkspaceDocumentSettings;
};

type WorkspaceContextType = {
  workspace: Workspace;
  role: Role;
  can: (minRole: Role) => boolean;
};

const Context = createContext<WorkspaceContextType | undefined>(undefined);

export function WorkspaceProvider({
  children,
  workspace,
  role,
}: {
  children: React.ReactNode;
  workspace: Workspace;
  role: Role;
}) {
  const can = useCallback(
    (minRole: Role) => hasMinRole(role, minRole),
    [role]
  );

  return (
    <Context.Provider value={{ workspace, role, can }}>
      {children}
    </Context.Provider>
  );
}

export function useWorkspace() {
  const context = useContext(Context);
  if (!context)
    throw new Error("useWorkspace must be used within WorkspaceProvider");
  return context;
}
