import { SignJWT } from "jose";
import { auth } from "@/auth";

export async function GET(): Promise<Response> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) {
    return Response.json({ error: "No autorizado" }, { status: 401 });
  }

  const secret = process.env.AUTH_SECRET;
  if (!secret) {
    return Response.json({ error: "AUTH_SECRET no está configurado" }, { status: 500 });
  }

  const token = await new SignJWT({ name: session.user.name })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(userId)
    .setIssuedAt()
    .setExpirationTime("10m")
    .sign(new TextEncoder().encode(secret));

  return Response.json({ token });
}
