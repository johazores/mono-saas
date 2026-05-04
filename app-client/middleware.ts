import { NextResponse, type NextRequest } from "next/server";

/**
 * Middleware for root-level CMS page routing.
 *
 * For paths that don't match known static routes, checks if a CMS page
 * exists with that slug. If found, rewrites to /p/[slug] (which handles
 * the actual rendering). This allows pages to be accessed at /about
 * instead of /p/about.
 *
 * Static routes (login, cart, checkout, etc.) are explicitly excluded
 * so they always take priority.
 */

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:7001";

// Known route prefixes that should never be treated as CMS page slugs
const STATIC_PREFIXES = [
  "/admin",
  "/login",
  "/user-login",
  "/user-register",
  "/cart",
  "/checkout",
  "/my-account",
  "/account",
  "/features",
  "/sub-users",
  "/purchases",
  "/downloads",
  "/p/",
  "/api/",
  "/_next/",
  "/favicon",
];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Skip known static prefixes and file requests
  if (
    STATIC_PREFIXES.some((prefix) => pathname.startsWith(prefix)) ||
    pathname.includes(".")
  ) {
    return NextResponse.next();
  }

  // Homepage: check if a CMS page is set as homepage
  if (pathname === "/") {
    try {
      const res = await fetch(`${API_URL}/api/cms/public/homepage`, {
        method: "HEAD",
        next: { revalidate: 60 },
      });
      if (res.ok) {
        const url = request.nextUrl.clone();
        url.pathname = "/p/__homepage";
        return NextResponse.rewrite(url);
      }
    } catch {
      // API unreachable, use default page
    }
    return NextResponse.next();
  }

  // Check if this is a single-segment path (potential CMS page slug)
  const segments = pathname.split("/").filter(Boolean);
  if (segments.length !== 1) {
    // Multi-segment paths fall through to [typeSlug]/[slug] or other routes
    return NextResponse.next();
  }

  const slug = segments[0];

  // Check if a CMS page exists with this slug
  try {
    const res = await fetch(`${API_URL}/api/cms/public/pages/${slug}`, {
      method: "HEAD",
      next: { revalidate: 60 },
    });

    if (res.ok) {
      // Rewrite to the internal /p/[slug] route
      const url = request.nextUrl.clone();
      url.pathname = `/p/${slug}`;
      return NextResponse.rewrite(url);
    }
  } catch {
    // If the API is unreachable, fall through to normal routing
  }

  // No CMS page found — let Next.js handle it (will try [typeSlug] route)
  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match all paths except:
     * - _next/static (static files)
     * - _next/image (image optimization)
     * - favicon.ico
     */
    "/((?!_next/static|_next/image|favicon.ico).*)",
  ],
};
