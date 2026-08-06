/**
 * The signed-out shell: full-bleed photograph on the left, form on the
 * right, edge to edge. Shared by login, signup and forgot-password so the
 * three read as one product.
 *
 * The photograph is /public/login-hero.jpg (see .auth-hero in
 * globals.css). If that file is absent the CSS backdrop underneath shows
 * instead, so the panel is never blank — it just loses the photo.
 *
 * Below lg the image panel drops away and the form owns the screen: half
 * a phone is too much to spend on decoration when the keyboard is about
 * to take the other half.
 */
export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="grid min-h-screen w-full bg-card lg:grid-cols-2">
      {/* Image panel — the photograph carries this side on its own. */}
      <div className="auth-hero relative hidden overflow-hidden lg:block">
        <div aria-hidden className="auth-hero-photo absolute inset-0" />
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
