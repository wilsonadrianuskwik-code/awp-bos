"use client";

import { useState } from "react";
import Link from "next/link";
import {
  Building2,
  Palette,
  CreditCard,
  FileText,
  LayoutTemplate,
  ChevronRight,
  Hash,
  Database,
  Shield,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils/cn";
import { useWorkspace } from "@/providers/workspace-provider";
import { CompanyProfileForm } from "@/features/templates/components/company-profile-form";
import { BrandingForm } from "@/features/templates/components/branding-form";
import { PaymentDetailsForm } from "@/features/templates/components/payment-details-form";
import { DefaultTermsForm } from "@/features/templates/components/default-terms-form";
import type { CompanyProfile, PaymentDetails, DefaultTerms, BrandingSettings } from "@/features/templates/types";

type Section = "company-profile" | "branding" | "payment-details" | "default-terms";

const SECTIONS: { id: Section; label: string; icon: typeof Building2; description: string }[] = [
  { id: "company-profile", label: "Company Profile", icon: Building2, description: "Name, address, and contact details" },
  { id: "branding", label: "Branding", icon: Palette, description: "Logo, tagline, and visual identity" },
  { id: "payment-details", label: "Payment Details", icon: CreditCard, description: "Bank accounts and payment instructions" },
  { id: "default-terms", label: "Default Terms", icon: FileText, description: "Terms & conditions defaults" },
];

// Split by how often they're touched, not by what they configure:
// Documents holds the panels edited while working, Setup holds the ones
// configured once when the workspace is set up and rarely revisited.
// A flat list gave a numbering template the same weight as branding.
const LINK_GROUPS: {
  label: string;
  links: { href: string; label: string; icon: typeof Building2 }[];
}[] = [
  {
    label: "Documents",
    links: [
      { href: "/settings/templates", label: "Document Designs", icon: LayoutTemplate },
      { href: "/settings/themes", label: "Themes", icon: Palette },
      { href: "/settings/master-data", label: "Master Data", icon: Database },
    ],
  },
  {
    label: "Setup",
    links: [
      { href: "/settings/numbering", label: "Document Numbering", icon: Hash },
      { href: "/settings/permissions", label: "Permissions", icon: Shield },
    ],
  },
];

type DocumentSettingsNavProps = {
  workspaceId: string;
  companyProfile: CompanyProfile;
  paymentDetails: PaymentDetails;
  defaultTerms: DefaultTerms;
  branding: BrandingSettings;
  logoUrl?: string | null;
};

export function DocumentSettingsNav({
  workspaceId,
  companyProfile,
  paymentDetails,
  defaultTerms,
  branding,
  logoUrl,
}: DocumentSettingsNavProps) {
  const [activeSection, setActiveSection] = useState<Section>("company-profile");
  const { workspace } = useWorkspace();

  return (
    <div className="flex flex-col gap-6 md:flex-row">
      <nav className="w-full shrink-0 space-y-1 md:w-56">
        {SECTIONS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => setActiveSection(id)}
            className={cn(
              "flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors",
              activeSection === id
                ? "bg-primary/10 font-medium text-primary"
                : "text-muted-foreground hover:bg-muted hover:text-foreground"
            )}
          >
            <Icon className="h-4 w-4" />
            {label}
          </button>
        ))}

        {LINK_GROUPS.map((group) => (
          <div key={group.label}>
            <div className="my-3 border-t" />
            <p className="px-3 pb-1 text-[11px] font-medium uppercase tracking-wider text-muted-foreground/70">
              {group.label}
            </p>
            {group.links.map(({ href, label, icon: Icon }) => (
              <Link
                key={href}
                href={`/${workspace.slug}${href}`}
                className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                <Icon className="h-4 w-4" />
                <span className="flex-1 text-left">{label}</span>
                <ChevronRight className="h-3.5 w-3.5" />
              </Link>
            ))}
          </div>
        ))}
      </nav>

      <div className="min-w-0 flex-1">
        {activeSection === "company-profile" && (
          <CompanyProfileForm workspaceId={workspaceId} companyProfile={companyProfile} />
        )}
        {activeSection === "branding" && (
          <BrandingForm workspaceId={workspaceId} branding={branding} logoUrl={logoUrl} />
        )}
        {activeSection === "payment-details" && (
          <PaymentDetailsForm workspaceId={workspaceId} paymentDetails={paymentDetails} />
        )}
        {activeSection === "default-terms" && (
          <DefaultTermsForm workspaceId={workspaceId} defaultTerms={defaultTerms} />
        )}
      </div>
    </div>
  );
}
