import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { DOWNLOAD_ACCESS_COOKIE_NAME, verifyDownloadAccessToken } from "@/lib/downloadAccess";
import { getDownloadBySlug } from "@/lib/downloadResources";

type Params = {
  params: Promise<{ slug: string }>;
};

export async function GET(request: Request, { params }: Params) {
  const { slug } = await params;
  const download = getDownloadBySlug(slug);

  if (!download) {
    return NextResponse.json({ error: "Recurso no encontrado." }, { status: 404 });
  }

  const cookieStore = await cookies();
  const token = cookieStore.get(DOWNLOAD_ACCESS_COOKIE_NAME)?.value;

  if (!verifyDownloadAccessToken(token)) {
    const unauthorizedUrl = new URL("/descargas?access=required", request.url);
    return NextResponse.redirect(unauthorizedUrl);
  }

  return NextResponse.redirect(download.downloadHref);
}
