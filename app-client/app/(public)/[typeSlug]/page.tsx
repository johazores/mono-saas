import Link from "next/link";
import { mediaUrl } from "@/lib/media-url";

const API_URL = process.env.NEXT_PUBLIC_API_URL;

type FlatItem = Record<string, unknown> & {
  id: string;
  title: string;
  slug: string;
};

async function getItems(typeSlug: string): Promise<FlatItem[]> {
  const res = await fetch(`${API_URL}/api/cms/public/content/${typeSlug}`, {
    next: { revalidate: 60 },
  });
  if (!res.ok) return [];
  const json = await res.json();
  // API returns { data: { contentType, items } } where items are already flattened
  return (json.data?.items as FlatItem[]) ?? [];
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ typeSlug: string }>;
}) {
  const { typeSlug } = await params;
  return {
    title: typeSlug.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
  };
}

export default async function ContentListPage({
  params,
}: {
  params: Promise<{ typeSlug: string }>;
}) {
  const { typeSlug } = await params;
  const items = await getItems(typeSlug);

  const heading = typeSlug
    .replace(/-/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());

  return (
    <main className="max-w-4xl mx-auto py-12 px-6">
      <h1 className="text-3xl font-bold mb-8 text-[var(--theme-text)]">
        {heading}
      </h1>
      {items.length === 0 && (
        <p className="text-[var(--theme-muted)]">No content published yet.</p>
      )}
      <div className="space-y-4">
        {items.map((item) => {
          const excerpt = item.excerpt as string | undefined;
          const featuredImage = item.featuredImage as string | undefined;
          const author = item.author as string | undefined;
          return (
            <Link
              key={item.id}
              href={`/${typeSlug}/${item.slug}`}
              className="flex gap-4 rounded-lg border border-[var(--theme-border)] bg-[var(--theme-surface)] p-6 hover:border-[var(--theme-primary)] transition-colors"
            >
              {featuredImage && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={mediaUrl(featuredImage)}
                  alt=""
                  className="h-24 w-24 shrink-0 rounded-md object-cover"
                />
              )}
              <div className="min-w-0">
                <h2 className="text-xl font-semibold text-[var(--theme-text)]">
                  {item.title}
                </h2>
                {author && (
                  <p className="mt-0.5 text-xs text-[var(--theme-muted)]">
                    By {author}
                  </p>
                )}
                {excerpt && (
                  <p className="mt-1 line-clamp-2 text-[var(--theme-muted)]">
                    {excerpt}
                  </p>
                )}
              </div>
            </Link>
          );
        })}
      </div>
    </main>
  );
}
