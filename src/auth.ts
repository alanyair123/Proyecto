import { PrismaAdapter } from "@auth/prisma-adapter";
import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { prisma } from "@/lib/prisma";
import authConfig from "./auth.config";

const testProviders =
  process.env.E2E_TEST_AUTH === "true"
    ? [
        Credentials({
          id: "test",
          name: "Playwright test login",
          credentials: {
            username: { label: "Usuario", type: "text" },
            password: { label: "Contraseña", type: "password" },
          },
          async authorize(credentials) {
            if (
              credentials?.username !== "tester" ||
              credentials?.password !== "correcta-123"
            ) {
              return null;
            }

            // Este usuario de prueba existe únicamente para que Playwright simule el login en CI.
            const user = await prisma.user.upsert({
              where: { email: "tester@seed.local" },
              update: { name: "tester" },
              create: { name: "tester", email: "tester@seed.local" },
              select: { id: true, name: true, email: true, image: true },
            });

            return user;
          },
        }),
      ]
    : [];

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [...authConfig.providers, ...testProviders],
  adapter: PrismaAdapter(prisma),
  session: { strategy: "jwt" },
});
