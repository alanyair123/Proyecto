import NextAuth from "next-auth";
import authConfig from "./auth.config";

const { auth } = NextAuth(authConfig);

export default auth((request) => {
  if (request.auth) {
    return;
  }

  const loginUrl = new URL("/login", request.nextUrl.origin);
  loginUrl.searchParams.set("callbackUrl", request.nextUrl.href);
  return Response.redirect(loginUrl);
});

export const config = {
  matcher: ["/stats/:path*", "/play/:path*", "/lobby/:path*"],
};
