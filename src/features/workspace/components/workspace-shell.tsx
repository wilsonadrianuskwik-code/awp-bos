"use client";

import { useState, useCallback } from "react";
import { Sidebar } from "@/components/layout/sidebar";
import { Header } from "@/components/layout/header";
import { MobileSidebar } from "@/components/layout/mobile-sidebar";

type WorkspaceShellProps = {
  children: React.ReactNode;
  workspaceSlug: string;
  workspaceName: string;
};

export function WorkspaceShell({
  children,
  workspaceSlug,
  workspaceName,
}: WorkspaceShellProps) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const closeMobile = useCallback(() => setMobileOpen(false), []);

  return (
    <div className="flex h-screen overflow-hidden">
      <div className="hidden md:flex">
        <Sidebar
          workspaceSlug={workspaceSlug}
          workspaceName={workspaceName}
        />
      </div>

      <MobileSidebar
        open={mobileOpen}
        onClose={closeMobile}
        workspaceSlug={workspaceSlug}
        workspaceName={workspaceName}
      />

      <div className="flex flex-1 flex-col overflow-hidden">
        <Header onMobileMenuToggle={() => setMobileOpen(true)} />
        <main className="flex-1 overflow-y-auto p-4 md:p-6">
          {children}
        </main>
      </div>
    </div>
  );
}
