import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

// Routes that do NOT require a login
const isPublicRoute = createRouteMatcher([
  "/",                    // landing page
  "/sign-in(.*)",
  "/sign-up(.*)",
  "/api/auth(.*)",        // NextAuth stub (keep for now) + any future public APIs
  "/api/webhooks(.*)",    // Stripe webhooks — secured by Stripe signature, not Clerk
]);

export default clerkMiddleware(async (auth, request) => {
  if (!isPublicRoute(request)) {
    await auth.protect();
  }
});

export const config = {
  matcher: [
    // Skip Next.js internals and static files
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jte?|ttf|woff2?|ico|gif|svg|png|jpg|jpeg|webp)).*)",
    // Always run for API routes
    "/(api|trpc)(.*)",
  ],
};
