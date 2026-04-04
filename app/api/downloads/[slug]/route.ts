import { NextResponse } from "next/server";
import { getDownloadBySlug } from "@/lib/downloadResources";

type Params = {
  params: Promise<{ slug: string }>;
};

export async function GET(_request: Request, { params }: Params) {
  const { slug } = await params;
  const download = getDownloadBySlug(slug);

  if (!download) {
    return NextResponse.json({ error: "Recurso no encontrado." }, { status: 404 });
  }

  const targetUrl = new URL(download.downloadHref);
  targetUrl.searchParams.set("ts", Date.now().toString());

  const response = NextResponse.redirect(targetUrl, 302);
  response.headers.set("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
  response.headers.set("Pragma", "no-cache");
  response.headers.set("Expires", "0");
  return response;
}
