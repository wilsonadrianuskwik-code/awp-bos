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
    <div className="flex h-screen overflow-hidden print:h-auto print:overflow-visible">
      <div className="hidden md:flex print:hidden">
        <Sidebar
          workspaceSlug={workspaceSlug}
          workspaceName={workspaceName}
        />
      </div>

      <div className="print:hidden">
        <MobileSidebar
          open={mobileOpen}
          onClose={closeMobile}
          workspaceSlug={workspaceSlug}
          workspaceName={workspaceName}
        />
      </div>

      <div className="flex flex-1 flex-col overflow-hidden print:overflow-visible">
        <div className="print:hidden">
          <Header
            workspaceSlug={workspaceSlug}
            onMobileMenuToggle={() => setMobileOpen(true)}
          />
        </div>
        <main className="flex-1 overflow-y-auto print:overflow-visible">
          <div className="mx-auto w-full max-w-[1440px] px-4 pb-10 pt-1 md:px-8 print:max-w-none print:p-0">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
