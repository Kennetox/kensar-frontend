import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import {
  createDownloadAccessToken,
  DOWNLOAD_ACCESS_COOKIE_MAX_AGE,
  DOWNLOAD_ACCESS_COOKIE_NAME,
  getDownloadAccessConfig,
  matchesDownloadCode,
  verifyDownloadAccessToken,
} from "@/lib/downloadAccess";

export async function GET() {
  const cookieStore = await cookies();
  const token = cookieStore.get(DOWNLOAD_ACCESS_COOKIE_NAME)?.value;
  const { hasCodes, hasSecret } = getDownloadAccessConfig();

  return NextResponse.json({
    granted: verifyDownloadAccessToken(token),
    configured: hasCodes && hasSecret,
  });
}

export async function POST(request: Request) {
  const { hasCodes, hasSecret } = getDownloadAccessConfig();

  if (!hasCodes || !hasSecret) {
    return NextResponse.json(
      { error: "Acceso de descargas no configurado." },
      { status: 503 },
    );
  }

  let code = "";

  try {
    const body = (await request.json()) as { code?: string };
    code = body.code ?? "";
  } catch {
    return NextResponse.json({ error: "Codigo invalido." }, { status: 400 });
  }

  if (!matchesDownloadCode(code)) {
    return NextResponse.json({ error: "Codigo incorrecto." }, { status: 401 });
  }

  const token = createDownloadAccessToken();
  if (!token) {
    return NextResponse.json(
      { error: "No se pudo emitir acceso de descarga." },
      { status: 503 },
    );
  }

  const response = NextResponse.json({ granted: true });
  response.cookies.set(DOWNLOAD_ACCESS_COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: DOWNLOAD_ACCESS_COOKIE_MAX_AGE,
    path: "/",
  });

  return response;
}

export async function DELETE() {
  const response = NextResponse.json({ granted: false });
  response.cookies.set(DOWNLOAD_ACCESS_COOKIE_NAME, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 0,
    path: "/",
  });

  return response;
}
