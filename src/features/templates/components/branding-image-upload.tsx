"use client";

import { useRef, useState } from "react";
import { ImageUp, Loader2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/providers/toast-provider";

// Per slot, because a logo and a wallpaper are not the same kind of file.
// Both stay under the bucket's own 8 MB ceiling (00120), which rejects
// anything larger server-side regardless of what this allows.
const MAX_BYTES: Record<string, number> = {
  logo: 2 * 1024 * 1024,
  signature: 2 * 1024 * 1024,
  "login-hero": 8 * 1024 * 1024,
};
const ACCEPTED = ["image/png", "image/jpeg", "image/webp", "image/svg+xml"];

type BrandingImageUploadProps = {
  workspaceId: string;
  /** Storage path segment under the workspace folder, e.g. "logo". */
  slot: "logo" | "signature" | "login-hero";
  value: string;
  onChange: (url: string) => void;
  disabled?: boolean;
  label: string;
  hint?: string;
  /** Signatures are wide and short; logos are roughly square. */
  previewClassName?: string;
};

/**
 * Uploads to the public `branding` bucket (00083) from the browser and
 * hands the resulting public URL back to the parent form, which persists
 * it. Files go to <workspace_id>/<slot>-<timestamp>.<ext> — the workspace
 * prefix is what the storage RLS policy checks, and the timestamp
 * sidesteps CDN caching of a replaced image at a stable path.
 */
export function BrandingImageUpload({
  workspaceId,
  slot,
  value,
  onChange,
  disabled,
  label,
  hint,
  previewClassName = "h-16 w-16",
}: BrandingImageUploadProps) {
  const { toast } = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);

  async function handleFile(file: File) {
    if (!ACCEPTED.includes(file.type)) {
      toast("Use a PNG, JPEG, WebP or SVG image", "error");
      return;
    }
    const maxBytes = MAX_BYTES[slot] ?? 2 * 1024 * 1024;
    if (file.size > maxBytes) {
      toast(
        `Image must be under ${Math.round(maxBytes / 1024 / 1024)} MB`,
        "error"
      );
      return;
    }

    setIsUploading(true);
    try {
      const supabase = createClient();
      const ext = file.name.split(".").pop()?.toLowerCase() || "png";
      const path = `${workspaceId}/${slot}-${Date.now()}.${ext}`;

      const { error } = await supabase.storage
        .from("branding")
        .upload(path, file, { upsert: true, contentType: file.type });

      if (error) {
        toast(error.message, "error");
        return;
      }

      const {
        data: { publicUrl },
      } = supabase.storage.from("branding").getPublicUrl(path);

      onChange(publicUrl);
      toast(`${label} uploaded`, "success");
    } finally {
      setIsUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div className="space-y-2">
      <span className="text-sm font-medium">{label}</span>
      <div className="flex items-center gap-4">
        <div
          className={`flex shrink-0 items-center justify-center overflow-hidden rounded-md border bg-muted/30 ${previewClassName}`}
        >
          {value ? (
            // Not next/image: these are user-supplied URLs on a Supabase
            // domain that isn't in next.config's remotePatterns, and
            // adding a wildcard host there for user content is worse than
            // skipping optimization for two small images.
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={value}
              alt={label}
              className="h-full w-full object-contain"
            />
          ) : (
            <ImageUp className="h-5 w-5 text-muted-foreground" />
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <input
            ref={inputRef}
            type="file"
            accept={ACCEPTED.join(",")}
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleFile(file);
            }}
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={disabled || isUploading}
            onClick={() => inputRef.current?.click()}
          >
            {isUploading ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <ImageUp className="mr-2 h-4 w-4" />
            )}
            {value ? "Replace" : "Upload"}
          </Button>
          {value && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={disabled || isUploading}
              onClick={() => onChange("")}
            >
              <Trash2 className="mr-2 h-4 w-4" />
              Remove
            </Button>
          )}
        </div>
      </div>
      {hint && <p className="text-[13px] text-muted-foreground">{hint}</p>}
    </div>
  );
}
