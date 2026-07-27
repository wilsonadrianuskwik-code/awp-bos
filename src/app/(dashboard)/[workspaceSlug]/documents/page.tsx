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

export default async function DocumentsRoute({
  params,
  searchParams,
}: {
  params: Promise<{ workspaceSlug: string }>;
  searchParams: Promise<{ project?: string; type?: string }>;
}) {
  const { workspaceSlug } = await params;
  const { project, type } = await searchParams;
  const workspace = await getWorkspaceBySlug(workspaceSlug);
  if (!workspace) notFound();

  // Filters come from the URL, so an unknown value is possible — ignore
  // it rather than passing it through to the query.
  const documentType = DOCUMENT_TYPES.includes(type as DocumentType)
    ? (type as DocumentType)
    : undefined;

  const [documents, projects] = await Promise.all([
    getAllDocuments(workspace.id, { projectId: project, documentType }),
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
