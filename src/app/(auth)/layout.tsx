import { getLoginHeroUrl } from "@/features/auth/queries";

/**
 * The signed-out shell: full-bleed photograph on the left, form on the
 * right, edge to edge. Shared by login, signup and forgot-password so the
 * three read as one product.
 *
 * The photograph is uploaded in Settings → Branding and read here with
 * no session (see getLoginHeroUrl). A file committed at
 * /public/login-hero.jpg still works as a second source, and under both
 * sits the CSS backdrop in .auth-hero — so the panel is never blank, it
 * only ever loses the photo.
 *
 * Below lg the image panel drops away and the form owns the screen: half
 * a phone is too much to spend on decoration when the keyboard is about
 * to take the other half.
 */
export default async function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const heroUrl = await getLoginHeroUrl();

  return (
    <div className="grid min-h-screen w-full bg-card lg:grid-cols-2">
      {/* Image panel — the photograph carries this side on its own. */}
      <div className="auth-hero relative hidden overflow-hidden lg:block">
        <div
          aria-hidden
          className="auth-hero-photo absolute inset-0"
          // The uploaded image wins when there is one; otherwise the
          // stylesheet's own default (/login-hero.jpg) applies.
          style={
            heroUrl
              ? ({ "--auth-photo": `url("${heroUrl}")` } as React.CSSProperties)
              : undefined
          }
        />
        {/* A vignette, not a scrim: nothing is set over the photograph, so
            this only keeps the corners from glaring against the white
            panel beside it. */}
        <div
          aria-hidden
          className="absolute inset-0 bg-[radial-gradient(75%_65%_at_50%_45%,transparent_0%,rgba(0,0,0,0.42)_100%)]"
        />
      </div>

      {/* Form panel. */}
      <div className="relative flex items-center justify-center px-6 py-10 sm:px-10 lg:px-16">
        <div className="w-full max-w-[400px]">{children}</div>
      </div>
    </div>
  );
}
