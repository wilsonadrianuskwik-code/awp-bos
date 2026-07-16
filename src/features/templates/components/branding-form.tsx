"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Palette, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useWorkspace } from "@/providers/workspace-provider";
import { useToast } from "@/providers/toast-provider";
import { updateBranding } from "@/features/templates/actions";
import { brandingSchema } from "@/features/templates/validators";
import type { BrandingSettings } from "@/features/templates/types";

type BrandingFormProps = {
  workspaceId: string;
  branding: BrandingSettings;
};

export function BrandingForm({ workspaceId, branding }: BrandingFormProps) {
  const router = useRouter();
  const { can, workspace } = useWorkspace();
  const { toast } = useToast();
  const [isPending, startTransition] = useTransition();
  const canEdit = can("admin");

  const [tagline, setTagline] = useState(branding.tagline ?? "");

  function handleSave() {
    const input = { tagline };
    const parsed = brandingSchema.safeParse(input);
    if (!parsed.success) {
      toast(parsed.error.issues[0].message, "error");
      return;
    }

    startTransition(async () => {
      const result = await updateBranding(workspaceId, parsed.data);
      if (result.error) {
        toast(result.error, "error");
        return;
      }
      toast("Branding updated", "success");
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Branding</CardTitle>
          <CardDescription>
            Your brand identity as it appears on documents — tagline and visual
            style.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Tagline</Label>
            <Input
              value={tagline}
              onChange={(e) => setTagline(e.target.value)}
              disabled={!canEdit}
              placeholder="e.g. Design Studio | Creative Agency"
            />
            <p className="text-xs text-muted-foreground">
              Appears below your company name on documents (optional).
            </p>
          </div>

          {canEdit && (
            <Button onClick={handleSave} disabled={isPending}>
              {isPending ? "Saving..." : "Save Changes"}
            </Button>
          )}
        </CardContent>
      </Card>

      <Link href={`/${workspace.slug}/settings/themes`}>
        <Card className="transition-colors hover:border-primary">
          <CardContent className="flex items-center gap-3 p-4">
            <Palette className="h-5 w-5 text-primary" />
            <div className="flex-1">
              <p className="text-sm font-semibold">Colors & Fonts</p>
              <p className="text-xs text-muted-foreground">
                Manage the color palette and typography your documents use
              </p>
            </div>
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          </CardContent>
        </Card>
      </Link>
    </div>
  );
}
