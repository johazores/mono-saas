import { notFound } from "next/navigation";
import { BlockRenderer } from "@/components/blocks/block-renderer";
import type { CmsPage, BlockTemplate } from "@/types";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:7001";

async function getPage(slug: string): Promise<CmsPage | null> {
  // Special slug for homepage
  if (slug === "__homepage") {
    const res = await fetch(`${API_URL}/api/cms/public/homepage`, {
      next: { revalidate: 60 },
    });
    if (!res.ok) return null;
    const json = await res.json();
    return json.data ?? null;
  }

  const res = await fetch(`${API_URL}/api/cms/public/pages/${slug}`, {
    next: { revalidate: 60 },
  });
  if (!res.ok) return null;
  const json = await res.json();
  return json.data ?? null;
}

async function getBlockTemplates(): Promise<BlockTemplate[]> {
  const res = await fetch(`${API_URL}/api/cms/public/block-templates`, {
    next: { revalidate: 300 },
  });
  if (!res.ok) return [];
  const json = await res.json();
  return json.data?.items ?? [];
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const page = await getPage(slug);
  if (!page) return {};
  return {
    title: page.seoTitle || page.title,
    description: page.seoDescription || "",
  };
}

export default async function CmsPageRoute({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const [page, templates] = await Promise.all([
    getPage(slug),
    getBlockTemplates(),
  ]);
  if (!page) notFound();

  return (
    <main>
      <BlockRenderer blocks={page.blocks || []} templates={templates} />
    </main>
  );
}
