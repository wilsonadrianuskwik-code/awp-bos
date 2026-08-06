"use client";

import { useState, useTransition } from "react";
import { Check, ChevronsUpDown, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils/cn";
import { useWorkspace } from "@/providers/workspace-provider";
import { useToast } from "@/providers/toast-provider";
import { createProjectAction } from "@/features/projects/actions";
import { mergeById } from "@/lib/utils/merge-by-id";

/** The shape every builder needs to render and pick a project. */
export type ProjectOption = { id: string; code: string; name: string };

type ProjectSelectorProps = {
  projects: ProjectOption[];
  value: string;
  onChange: (projectId: string) => void;
  /** Pre-fills the new project's client when the document already has one. */
  clientId?: string;
  disabled?: boolean;
};

/**
 * Project picker with inline create — same shape as ClientSelector and
 * SupplierSelector.
 *
 * Project is required on every document, so a plain select meant hitting
 * a wall mid-document whenever the project didn't exist yet: abandon the
 * draft, go create it, come back. Creating one here needs only a code and
 * a name; everything else is filled in later from the Projects page.
 */
export function ProjectSelector({
  projects,
  value,
  onChange,
  clientId,
  disabled,
}: ProjectSelectorProps) {
  const { can } = useWorkspace();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);

  // Projects created inline aren't in the server-fetched prop, so they're
  // held here and merged in — keeps the trigger label and the search list
  // correct without the parent having to re-fetch.
  const [createdProjects, setCreatedProjects] = useState<ProjectOption[]>([]);
  const allProjects = mergeById(createdProjects, projects);

  const selected = allProjects.find((p) => p.id === value);
  const term = query.trim().toLowerCase();
  const filtered = allProjects.filter(
    (p) =>
      p.name.toLowerCase().includes(term) || p.code.toLowerCase().includes(term)
  );

  // Same staff+ gate createProjectAction enforces server-side — offering
  // an action that could only fail helps nobody.
  const hasExactMatch = allProjects.some(
    (p) => p.name.trim().toLowerCase() === term || p.code.trim().toLowerCase() === term
  );
  const showCreate = can("staff") && term.length > 0 && !hasExactMatch;

  function handleSelect(project: ProjectOption) {
    onChange(project.id);
    setOpen(false);
    setQuery("");
  }

  function handleCreated(project: ProjectOption) {
    setCreatedProjects((prev) => [project, ...prev]);
    handleSelect(project);
    setDialogOpen(false);
  }

  return (
    <>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            role="combobox"
            disabled={disabled}
            className="h-8 w-full justify-between font-normal"
          >
            <span className={cn("truncate", !selected && "text-muted-foreground")}>
              {selected ? `${selected.code} — ${selected.name}` : "Select a project"}
            </span>
            <ChevronsUpDown className="ml-2 h-3.5 w-3.5 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-[calc(100vw-2rem)] p-0 sm:w-[320px]">
          <div className="p-2">
            <Input
              autoFocus
              placeholder="Search projects..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="h-8"
            />
          </div>
          <div className="max-h-60 overflow-y-auto border-t">
            {filtered.length === 0 && !showCreate ? (
              <p className="p-3 text-sm text-muted-foreground">No projects found.</p>
            ) : (
              <>
                {filtered.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => handleSelect(p)}
                    className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-accent"
                  >
                    <span className="truncate">
                      <span className="font-mono text-xs text-muted-foreground">
                        {p.code}
                      </span>{" "}
                      <span className="font-medium">{p.name}</span>
                    </span>
                    {p.id === value && <Check className="h-4 w-4 shrink-0" />}
                  </button>
                ))}
                {showCreate && (
                  <button
                    type="button"
                    onClick={() => {
                      setOpen(false);
                      setDialogOpen(true);
                    }}
                    className="flex w-full items-center gap-2 border-t px-3 py-2 text-left text-sm text-primary hover:bg-accent"
                  >
                    <Plus className="h-4 w-4 shrink-0" />
                    <span className="truncate">
                      Create new project &ldquo;{query.trim()}&rdquo;
                    </span>
                  </button>
                )}
              </>
            )}
          </div>
        </PopoverContent>
      </Popover>

      <CreateProjectDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        initialName={query.trim()}
        clientId={clientId}
        onCreated={handleCreated}
      />
    </>
  );
}

function CreateProjectDialog({
  open,
  onOpenChange,
  initialName,
  clientId,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialName: string;
  clientId?: string;
  onCreated: (project: ProjectOption) => void;
}) {
  const { workspace } = useWorkspace();
  const { toast } = useToast();
  const [isPending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const code = (formData.get("code") as string)?.trim() ?? "";
    const name = (formData.get("name") as string)?.trim() ?? "";
    if (!code || !name) {
      toast("Project code and name are required", "error");
      return;
    }
    if (clientId) formData.set("client_id", clientId);

    startTransition(async () => {
      const result = await createProjectAction(workspace.id, formData);
      if (result.error || !result.data) {
        toast(result.error ?? "Failed to create project", "error");
        return;
      }
      onCreated({ id: result.data.id, code, name });
      toast("Project created", "success");
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Create Project</DialogTitle>
            <DialogDescription>
              Add a new project without leaving this document. Dates, budget
              and site address can be filled in later from the Projects page.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="new-project-code">Code *</Label>
              <Input
                id="new-project-code"
                name="code"
                required
                maxLength={100}
                placeholder="e.g. BALI-VILLA-07"
                autoFocus
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="new-project-name">Name *</Label>
              <Input
                id="new-project-name"
                name="name"
                defaultValue={initialName}
                required
                maxLength={255}
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isPending}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isPending}>
              Create Project
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
