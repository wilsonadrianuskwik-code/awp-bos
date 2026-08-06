/**
 * The signed-out shell: one rounded card floating on a soft page, split
 * into a dark image panel and a light form panel. Shared by login, signup
 * and forgot-password so the three read as one product.
 *
 * The photograph is /login-hero.jpg (see .auth-hero in globals.css). If
 * that file is absent the CSS backdrop underneath shows instead, so the
 * panel is never blank — it just loses the photo.
 *
 * Below lg the card becomes the whole screen and the image panel drops
 * away: half a phone screen is too much to spend on decoration when the
 * keyboard is about to take the other half.
 */
export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="auth-page min-h-screen p-0 sm:p-6 lg:p-10">
      <div className="auth-card mx-auto grid min-h-screen w-full max-w-[1360px] overflow-hidden bg-card sm:min-h-[calc(100vh-3rem)] sm:rounded-[28px] lg:min-h-[calc(100vh-5rem)] lg:grid-cols-2">
        {/* Image panel. Hidden below lg — the form panel then owns the
            whole card. */}
        <div className="auth-hero relative hidden overflow-hidden lg:block">
          <div aria-hidden className="auth-hero-photo absolute inset-0" />
          {/* Reads the headline over any photograph: dark at the foot
              where the type sits, clear at the top where it doesn't. */}
          <div
            aria-hidden
            className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/45 to-black/25"
          />

          <div className="relative flex h-full flex-col justify-between p-12 xl:p-14">
            <p className="auth-fade text-[13px] leading-relaxed text-white/70 [animation-delay:80ms]">
              Painting, epoxy and protective coating — from quotation to
              final invoice.
            </p>

            <div>
              <h1 className="auth-fade text-[44px] font-semibold leading-[0.98] tracking-[-0.02em] text-white [animation-delay:160ms] xl:text-[54px]">
                Run the whole
                <br />
                job from
                <br />
                one desk.
              </h1>
              <p className="auth-fade mt-6 max-w-sm text-[14px] leading-relaxed text-white/60 [animation-delay:240ms]">
                Projects, quotations, purchase orders and invoices — with
                PPN, PPH and retensi already worked out.
              </p>
            </div>
          </div>
        </div>

        {/* Form panel. */}
        <div className="relative flex items-center justify-center px-6 py-10 sm:px-10 lg:px-14">
          <div className="w-full max-w-[400px]">{children}</div>
        </div>
      </div>
    </div>
  );
}
