import { notFound } from "next/navigation";
import { getWorkspaceBySlug } from "@/lib/workspace";
import { PageHeader } from "@/components/shared/page-header";
import { getAllProjects } from "@/features/projects/queries";
import { getAllDocuments } from "@/features/documents/all-documents-queries";
import {
  DOCUMENT_TYPES,
  type DocumentType,
} from "@/features/documents/document-types";
import { AllDocumentsPage } from "@/features/documents/components/all-documents-page";

type SearchParams = {
  project?: string;
  type?: string;
  q?: string;
  from?: string;
  to?: string;
  min?: string;
  max?: string;
  paidFrom?: string;
  paidTo?: string;
  status?: string;
};

export default async function DocumentsRoute({
  params,
  searchParams,
}: {
  params: Promise<{ workspaceSlug: string }>;
  searchParams: Promise<SearchParams>;
}) {
  const { workspaceSlug } = await params;
  const sp = await searchParams;
  const workspace = await getWorkspaceBySlug(workspaceSlug);
  if (!workspace) notFound();

  // Filters arrive from the URL, so anything here can be malformed —
  // an unusable value is dropped rather than passed to the query.
  const documentType = DOCUMENT_TYPES.includes(sp.type as DocumentType)
    ? (sp.type as DocumentType)
    : undefined;
  const number = (value?: string) => {
    const parsed = Number(value);
    return value && Number.isFinite(parsed) ? parsed : undefined;
  };

  const [documents, projects] = await Promise.all([
    getAllDocuments(workspace.id, {
      projectId: sp.project,
      documentType,
      search: sp.q,
      dateFrom: sp.from,
      dateTo: sp.to,
      amountMin: number(sp.min),
      amountMax: number(sp.max),
      paidFrom: sp.paidFrom,
      paidTo: sp.paidTo,
      status: sp.status,
    }),
    getAllProjects(workspace.id),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Documents"
        description="Every quotation, proforma invoice, invoice, purchase order and delivery order in one place"
      />
      <AllDocumentsPage
        documents={documents}
        projects={projects.map((p) => ({ id: p.id, code: p.code, name: p.name }))}
      />
    </div>
  );
}
