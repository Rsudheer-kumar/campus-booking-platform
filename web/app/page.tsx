export default function Home() {
  return (
    <main className="min-h-screen grid-background">
      <section className="mx-auto flex min-h-screen max-w-7xl items-center px-6 py-20">
        <div className="max-w-3xl">
          <div className="mb-6 inline-flex items-center rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-sm text-slate-300 backdrop-blur-xl">
            <span className="mr-2 h-2 w-2 rounded-full bg-primary animate-pulse-soft" />
            Unified Campus Resource Platform
          </div>

          <h1 className="text-5xl font-semibold tracking-tight sm:text-7xl">
            One campus.
            <br />
            <span className="text-gradient">Every resource.</span>
            <br />
            One booking system.
          </h1>

          <p className="mt-6 max-w-2xl text-lg leading-8 text-muted">
            Discover classrooms, laboratories, equipment, seminar halls and
            facilities from one intelligent booking platform.
          </p>

          <div className="mt-10 flex flex-wrap gap-4">
            <button className="rounded-xl bg-primary px-6 py-3 font-medium text-white transition hover:bg-primary-bright">
              Explore Resources
            </button>

            <button className="rounded-xl border border-white/10 bg-white/[0.04] px-6 py-3 font-medium text-white backdrop-blur-xl transition hover:bg-white/[0.08]">
              Sign In
            </button>
          </div>

          <div className="mt-14 grid max-w-2xl grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="surface rounded-2xl p-5">
              <p className="text-2xl font-semibold">148</p>
              <p className="mt-1 text-sm text-muted">Resources</p>
            </div>

            <div className="surface rounded-2xl p-5">
              <p className="text-2xl font-semibold">0</p>
              <p className="mt-1 text-sm text-muted">Double Bookings</p>
            </div>

            <div className="surface rounded-2xl p-5">
              <p className="text-2xl font-semibold">78%</p>
              <p className="mt-1 text-sm text-muted">Utilisation</p>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}