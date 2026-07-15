"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { MoreVertical, Plus, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useToast } from "@/providers/toast-provider";
import { useWorkspace } from "@/providers/workspace-provider";
import { TemplateThumbnail } from "@/features/templates/components/template-thumbnail";
import { createTemplate, duplicateTemplate, deleteTemplate, setDefaultTemplate } from "@/features/templates/actions";
import { getDefaultBlocksForDocumentType } from "@/features/templates/presets";
import type { DocumentTemplateWithTheme, TemplateDocumentType, TemplateTheme } from "@/features/templates/types";

const DOCUMENT_TYPE_TABS: { value: TemplateDocumentType; label: string }[] = [
  { value: "invoice", label: "Invoices" },
  { value: "quotation", label: "Quotations" },
];

type TemplateGalleryProps = {
  workspaceId: string;
  templates: DocumentTemplateWithTheme[];
  themes: TemplateTheme[];
};

export function TemplateGallery({ workspaceId, templates, themes }: TemplateGalleryProps) {
  const router = useRouter();
  const { toast } = useToast();
  const { can } = useWorkspace();
  const canEdit = can("staff");
  const [activeType, setActiveType] = useState<TemplateDocumentType>("invoice");
  const [newDesignOpen, setNewDesignOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  const visibleTemplates = useMemo(
    () => templates.filter((t) => t.document_type === activeType),
    [templates, activeType]
  );

  function handleSetDefault(templateId: string) {
    startTransition(async () => {
      const result = await setDefaultTemplate(workspaceId, templateId);
      if (result.error) {
        toast(result.error, "error");
        return;
      }
      toast("Default design updated", "success");
      router.refresh();
    });
  }

  function handleDuplicate(templateId: string) {
    startTransition(async () => {
      const result = await duplicateTemplate(workspaceId, templateId);
      if (result.error) {
        toast(result.error, "error");
        return;
      }
      toast("Design duplicated", "success");
      router.refresh();
    });
  }

  function handleDelete(templateId: string) {
    if (!window.confirm("Delete this design? This can't be undone.")) return;
    startTransition(async () => {
      const result = await deleteTemplate(workspaceId, templateId);
      if (result.error) {
        toast(result.error, "error");
        return;
      }
      toast("Design deleted", "success");
      router.refresh();
    });
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex rounded-md border bg-muted p-1">
          {DOCUMENT_TYPE_TABS.map((tab) => (
            <button
              key={tab.value}
              type="button"
              onClick={() => setActiveType(tab.value)}
              className={`rounded-sm px-3 py-1.5 text-sm font-medium transition-colors ${
                activeType === tab.value
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {canEdit && (
          <Button size="sm" onClick={() => setNewDesignOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            New Design
          </Button>
        )}
      </div>

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {visibleTemplates.map((template) => (
          <div
            key={template.id}
            className="group overflow-hidden rounded-lg border-2 border-border bg-card transition-colors hover:border-primary"
          >
            <div className="relative">
              <TemplateThumbnail template={template} theme={template.theme} />
              {template.is_default && (
                <Badge className="absolute right-2 top-2 gap-1" variant="default">
                  <Check className="h-3 w-3" /> Default
                </Badge>
              )}
            </div>
            <div className="flex items-center justify-between gap-2 p-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold">{template.name}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {template.theme?.name ?? "No theme"}
                </p>
              </div>
              {canEdit && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" disabled={isPending}>
                      <MoreVertical className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    {!template.is_default && (
                      <DropdownMenuItem onClick={() => handleSetDefault(template.id)}>
                        Set as Default
                      </DropdownMenuItem>
                    )}
                    <DropdownMenuItem onClick={() => handleDuplicate(template.id)}>
                      Duplicate
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() => handleDelete(template.id)}
                      disabled={template.is_default}
                      className="text-destructive focus:text-destructive"
                    >
                      Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </div>
          </div>
        ))}

        {canEdit && (
          <button
            type="button"
            onClick={() => setNewDesignOpen(true)}
            className="flex min-h-[280px] flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-border text-muted-foreground transition-colors hover:border-primary hover:text-primary"
          >
            <Plus className="h-6 w-6" />
            <span className="text-sm font-medium">Start from a preset</span>
          </button>
        )}
      </div>

      {visibleTemplates.length === 0 && !canEdit && (
        <p className="text-sm text-muted-foreground">No designs yet for this document type.</p>
      )}

      <NewDesignDialog
        open={newDesignOpen}
        onOpenChange={setNewDesignOpen}
        workspaceId={workspaceId}
        documentType={activeType}
        themes={themes}
      />
    </div>
  );
}

type NewDesignDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workspaceId: string;
  documentType: TemplateDocumentType;
  themes: TemplateTheme[];
};

function NewDesignDialog({ open, onOpenChange, workspaceId, documentType, themes }: NewDesignDialogProps) {
  const router = useRouter();
  const { toast } = useToast();
  const [isPending, startTransition] = useTransition();
  const [name, setName] = useState("");
  const [themeId, setThemeId] = useState(themes[0]?.id ?? "");

  function handleCreate() {
    if (!name.trim()) {
      toast("Give your design a name", "error");
      return;
    }

    startTransition(async () => {
      const result = await createTemplate(workspaceId, {
        name: name.trim(),
        document_type: documentType,
        theme_id: themeId || null,
        blocks: getDefaultBlocksForDocumentType(documentType),
        page_settings: { size: "A4", orientation: "portrait" },
      });
      if (result.error) {
        toast(result.error, "error");
        return;
      }
      toast("Design created", "success");
      setName("");
      onOpenChange(false);
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Start a New Design</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Design name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Detailed Invoice" />
          </div>

          <div className="space-y-2">
            <Label>Starting theme</Label>
            <Select value={themeId} onValueChange={setThemeId}>
              <SelectTrigger>
                <SelectValue placeholder="Choose a theme" />
              </SelectTrigger>
              <SelectContent>
                {themes.map((theme) => (
                  <SelectItem key={theme.id} value={theme.id}>
                    {theme.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              You'll start with a professionally designed layout and can customize colors, fonts, and sections afterward.
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleCreate} disabled={isPending}>
            {isPending ? "Creating..." : "Create Design"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
