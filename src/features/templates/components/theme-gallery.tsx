"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { MoreVertical, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useToast } from "@/providers/toast-provider";
import { useConfirm } from "@/providers/confirm-provider";
import { useWorkspace } from "@/providers/workspace-provider";
import { ThemeEditorDialog } from "@/features/templates/components/theme-editor-dialog";
import { deleteTheme } from "@/features/templates/actions";
import type { TemplateTheme } from "@/features/templates/types";

type ThemeGalleryProps = {
  workspaceId: string;
  themes: TemplateTheme[];
};

export function ThemeGallery({ workspaceId, themes }: ThemeGalleryProps) {
  const router = useRouter();
  const { toast } = useToast();
  const { can } = useWorkspace();
  const confirm = useConfirm();
  const canEdit = can("staff");
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingTheme, setEditingTheme] = useState<TemplateTheme | null>(null);
  const [, startTransition] = useTransition();

  function openCreate() {
    setEditingTheme(null);
    setEditorOpen(true);
  }

  function openEdit(theme: TemplateTheme) {
    setEditingTheme(theme);
    setEditorOpen(true);
  }

  async function handleDelete(themeId: string) {
    const ok = await confirm({
      title: "Delete this theme?",
      description: "This can't be undone.",
      confirmLabel: "Delete",
      destructive: true,
    });
    if (!ok) return;
    startTransition(async () => {
      const result = await deleteTheme(workspaceId, themeId);
      if (result.error) {
        toast(result.error, "error");
        return;
      }
      toast("Theme deleted", "success");
      router.refresh();
    });
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-end">
        {canEdit && (
          <Button size="sm" onClick={openCreate}>
            <Plus className="mr-2 h-4 w-4" />
            New Theme
          </Button>
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {themes.map((theme) => (
          <div key={theme.id} className="rounded-lg border bg-card p-4 shadow-2xs transition-colors duration-150 hover:border-primary/50">
            <div className="mb-3 flex gap-1.5">
              {[theme.config.colors.primary, theme.config.colors.secondary, theme.config.colors.surface, theme.config.colors.border].map(
                (color, i) => (
                  <div key={i} className="h-8 flex-1 rounded" style={{ background: color }} />
                )
              )}
            </div>
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold">{theme.name}</p>
                {theme.is_preset && (
                  <Badge variant="secondary" className="mt-0.5">
                    Preset
                  </Badge>
                )}
              </div>
              {canEdit && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" aria-label="More actions">
                      <MoreVertical className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => openEdit(theme)}>Edit</DropdownMenuItem>
                    {theme.is_preset ? (
                      <DropdownMenuItem
                        disabled
                        className="flex-col items-start gap-0.5 text-muted-foreground"
                      >
                        <span>Delete</span>
                        <span className="text-xs">Built-in themes can&apos;t be deleted</span>
                      </DropdownMenuItem>
                    ) : (
                      <DropdownMenuItem
                        onClick={() => handleDelete(theme.id)}
                        className="text-destructive focus:text-destructive"
                      >
                        Delete
                      </DropdownMenuItem>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </div>
          </div>
        ))}
      </div>

      <ThemeEditorDialog
        open={editorOpen}
        onOpenChange={setEditorOpen}
        workspaceId={workspaceId}
        theme={editingTheme}
      />
    </div>
  );
}
