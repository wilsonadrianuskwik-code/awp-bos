"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
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
import { useToast } from "@/providers/toast-provider";
import { createTheme, updateTheme } from "@/features/templates/actions";
import { PRESET_THEMES, PRESET_THEME_NAMES, type PresetThemeName } from "@/features/templates/presets";
import { derivePaletteFromPrimary, type DerivedPalette } from "@/features/templates/color-utils";
import type { ThemeConfig, TemplateTheme } from "@/features/templates/types";

type ThemeEditorDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workspaceId: string;
  /** Present when editing an existing (non-preset) theme; absent when creating a new one. */
  theme?: TemplateTheme | null;
};

const COLOR_TOKEN_LABELS: { key: keyof DerivedPalette; label: string }[] = [
  { key: "primary", label: "Primary" },
  { key: "secondary", label: "Secondary" },
  { key: "text", label: "Text" },
  { key: "muted", label: "Muted Text" },
  { key: "surface", label: "Surface" },
  { key: "border", label: "Border" },
];

export function ThemeEditorDialog({ open, onOpenChange, workspaceId, theme }: ThemeEditorDialogProps) {
  const router = useRouter();
  const { toast } = useToast();
  const [isPending, startTransition] = useTransition();
  const isEditing = Boolean(theme);

  const [name, setName] = useState(theme?.name ?? "");
  const [baseStyle, setBaseStyle] = useState<PresetThemeName>("Modern");
  const [primaryColor, setPrimaryColor] = useState(theme?.config.colors.primary ?? PRESET_THEMES.Modern.colors.primary);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [overrides, setOverrides] = useState<Partial<DerivedPalette>>({});

  const derivedPalette = useMemo(() => derivePaletteFromPrimary(primaryColor), [primaryColor]);
  const effectivePalette: DerivedPalette = { ...derivedPalette, ...overrides };

  function handleOverrideChange(key: keyof DerivedPalette, value: string) {
    setOverrides((prev) => ({ ...prev, [key]: value }));
  }

  function handleSave() {
    if (!name.trim()) {
      toast("Give your theme a name", "error");
      return;
    }

    const baseConfig: ThemeConfig = theme?.config ?? PRESET_THEMES[baseStyle];
    const config: ThemeConfig = {
      ...baseConfig,
      colors: {
        primary: effectivePalette.primary,
        secondary: effectivePalette.secondary,
        text: effectivePalette.text,
        muted: effectivePalette.muted,
        background: effectivePalette.background,
        surface: effectivePalette.surface,
        border: effectivePalette.border,
      },
    };

    startTransition(async () => {
      const result = theme
        ? await updateTheme(workspaceId, theme.id, { name: name.trim(), config })
        : await createTheme(workspaceId, { name: name.trim(), config });

      if (result.error) {
        toast(result.error, "error");
        return;
      }
      toast(isEditing ? "Theme updated" : "Theme created", "success");
      onOpenChange(false);
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{isEditing ? "Edit Theme" : "New Theme"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Theme name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Ocean Blue" />
          </div>

          {!isEditing && (
            <div className="space-y-2">
              <Label>Style</Label>
              <Select value={baseStyle} onValueChange={(v) => setBaseStyle(v as PresetThemeName)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PRESET_THEME_NAMES.map((n) => (
                    <SelectItem key={n} value={n}>
                      {n}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">Sets the typography and layout feel — you'll customize the colors next.</p>
            </div>
          )}

          <div className="space-y-2">
            <Label>Your Brand Color</Label>
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={primaryColor}
                onChange={(e) => {
                  setPrimaryColor(e.target.value);
                  setOverrides({});
                }}
                className="h-9 w-12 cursor-pointer rounded border"
              />
              <Input
                value={primaryColor}
                onChange={(e) => {
                  setPrimaryColor(e.target.value);
                  setOverrides({});
                }}
                className="font-mono text-sm"
              />
            </div>
            <p className="text-xs text-muted-foreground">Used for headings, accents, and totals — matching colors are generated automatically.</p>
          </div>

          <div className="flex gap-2">
            {COLOR_TOKEN_LABELS.map(({ key }) => (
              <div
                key={key}
                title={key}
                className="h-7 w-7 rounded border"
                style={{ background: effectivePalette[key] }}
              />
            ))}
          </div>

          <button
            type="button"
            onClick={() => setAdvancedOpen((v) => !v)}
            className="text-xs font-medium text-primary hover:underline"
          >
            {advancedOpen ? "Hide advanced colors" : "Advanced: customize individual colors"}
          </button>

          {advancedOpen && (
            <div className="grid grid-cols-2 gap-3 rounded-md border bg-muted/40 p-3">
              {COLOR_TOKEN_LABELS.map(({ key, label }) => (
                <div key={key} className="space-y-1">
                  <Label className="text-xs">{label}</Label>
                  <div className="flex items-center gap-1.5">
                    <input
                      type="color"
                      value={effectivePalette[key]}
                      onChange={(e) => handleOverrideChange(key, e.target.value)}
                      className="h-7 w-8 cursor-pointer rounded border"
                    />
                    <Input
                      value={effectivePalette[key]}
                      onChange={(e) => handleOverrideChange(key, e.target.value)}
                      className="font-mono text-xs"
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={isPending}>
            {isPending ? "Saving..." : isEditing ? "Save Changes" : "Create Theme"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
