import { getLoginHeroUrl } from "@/features/auth/queries";

/**
 * The signed-out shell: the photograph fills the screen and the form
 * floats on it in a glass card. Shared by login, signup and
 * forgot-password so the three read as one product.
 *
 * There is no split and no side panel — the photograph is the page. A
 * vignette pulls the edges down so the card has something to sit against,
 * and the card carries its own blur, so the type never depends on what
 * happens to be behind it at that moment.
 *
 * The photograph is uploaded in Settings → Branding and read here with no
 * session (see getLoginHeroUrl). A file at /public/login-hero.jpg still
 * works as a second source, and under both sits the CSS backdrop in
 * .auth-hero — so the page is never blank, it only ever loses the photo.
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
      {/* Two layers doing different jobs: a vignette that darkens the
          edges and leaves the middle of the photograph alone, and a flat
          wash that lifts every white pixel off it a little. */}
      <div
        aria-hidden
        className="absolute inset-0 bg-[radial-gradient(95%_75%_at_50%_45%,transparent_0%,rgba(0,0,0,0.58)_100%)]"
      />
      <div aria-hidden className="absolute inset-0 bg-black/25" />

      <div className="relative flex min-h-screen items-center justify-center px-5 py-12 sm:px-6">
        <div className="w-full max-w-[420px]">{children}</div>
      </div>
    </div>
  );
}
