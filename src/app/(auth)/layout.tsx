import { getLoginHeroUrl } from "@/features/auth/queries";

/**
 * The signed-out shell: the photograph runs the full width, and the form
 * sits on the right under a dark, faintly graded, translucent panel.
 * Shared by login, signup and forgot-password so the three read as one
 * product.
 *
 * The photograph spans the whole screen rather than only its own column
 * because the panel over it is translucent — and a see-through panel on a
 * solid surface is just a darker solid surface. Blurred as well as
 * darkened, so detail behind the fields cannot compete with them.
 *
 * The photograph is uploaded in Settings → Branding and read here with no
 * session (see getLoginHeroUrl). A file committed at
 * /public/login-hero.jpg still works as a second source, and under both
 * sits the CSS backdrop in .auth-hero — so the panel is never blank, it
 * only ever loses the photo.
 *
 * Below lg the panel covers the screen: half a phone is too much to spend
 * on decoration when the keyboard is about to take the other half.
 */
export default async function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const heroUrl = await getLoginHeroUrl();

  return (
    <div className="auth-hero relative min-h-screen w-full overflow-hidden">
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
      {/* A vignette over the exposed half, so the photograph's corners do
          not glare beside the panel. */}
      <div
        aria-hidden
        className="absolute inset-0 bg-[radial-gradient(75%_65%_at_28%_45%,transparent_0%,rgba(0,0,0,0.5)_100%)]"
      />

      <div className="relative grid min-h-screen lg:grid-cols-2">
        {/* Left column is deliberately empty — the photograph is the
            content there, and anything set over it competes with it. */}
        <div className="hidden lg:block" />

        <div className="relative flex items-center justify-center bg-gradient-to-b from-black/78 via-black/85 to-black/92 px-6 py-10 backdrop-blur-2xl sm:px-10 lg:px-16">
          {/* One hairline of light down the join — the only thing marking
              where the panel begins. */}
          <div
            aria-hidden
            className="pointer-events-none absolute inset-y-0 left-0 hidden w-px bg-gradient-to-b from-transparent via-white/20 to-transparent lg:block"
          />
          <div className="w-full max-w-[400px]">{children}</div>
        </div>
      </div>
    </div>
  );
}
