import Link from "next/link"

export default function Home() {
  return (
    <div className="min-h-screen bg-[#09090b] text-white overflow-hidden dark noise-overlay">

      {/* ── Background Layer ── */}
      <div className="fixed inset-0 pointer-events-none z-0">
        {/* Hero grid */}
        <div className="absolute inset-0 hero-grid" />
        {/* Glow orbs */}
        <div className="glow-orb w-[600px] h-[600px] bg-blue-600/20 -top-48 -left-24" />
        <div className="glow-orb w-[500px] h-[500px] bg-violet-600/15 top-1/3 right-0" />
        <div className="glow-orb w-[400px] h-[400px] bg-emerald-600/10 bottom-0 left-1/3" />
      </div>

      {/* ── Navbar ── */}
      <nav className="relative z-50 flex items-center justify-between px-6 lg:px-12 py-5 border-b border-white/[0.06] backdrop-blur-xl bg-black/20">
        <Link href="/" className="flex items-center gap-2.5 group">
          <div className="w-8 h-8 rounded-lg bg-white flex items-center justify-center shadow-[0_0_20px_rgba(255,255,255,0.3)] group-hover:shadow-[0_0_30px_rgba(255,255,255,0.5)] transition-shadow">
            <span className="text-black font-black text-sm">P</span>
          </div>
          <span className="text-lg font-bold tracking-tight">PaperBlast</span>
        </Link>

        <div className="hidden md:flex items-center gap-8">
          {["Features", "How it works", "Stats"].map((item) => (
            <Link
              key={item}
              href={`#${item.toLowerCase().replace(/ /g, "-")}`}
              className="text-sm text-zinc-400 hover:text-white transition-colors duration-200 relative after:absolute after:bottom-0 after:left-0 after:w-0 after:h-px after:bg-white after:transition-all hover:after:w-full"
            >
              {item}
            </Link>
          ))}
        </div>

        <div className="flex items-center gap-3">
          <Link href="/auth/login" className="text-sm text-zinc-400 hover:text-white transition-colors px-4 py-2">
            Sign in
          </Link>
          <Link
            href="/auth/login"
            className="cta-glow text-black text-sm font-semibold px-5 py-2 rounded-full shadow-[0_0_20px_rgba(255,255,255,0.15)]"
          >
            Get Started →
          </Link>
        </div>
      </nav>

      {/* ── Hero Section ── */}
      <section className="relative z-10 flex flex-col items-center text-center pt-28 pb-20 px-6">
        {/* Badge */}
        <div className="badge-float inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 backdrop-blur-md px-4 py-1.5 text-xs font-medium text-zinc-300 mb-8">
          <span className="flex h-1.5 w-1.5 rounded-full bg-emerald-400 shadow-[0_0_8px_#34d399] animate-pulse" />
          JEE Main 2013-2024 · 11,000+ Questions
        </div>

        {/* Headline */}
        <h1 className="text-5xl sm:text-6xl lg:text-[82px] font-black tracking-tighter leading-[0.92] max-w-5xl mb-6">
          <span className="gradient-text block">Crack JEE with</span>
          <span className="block text-white">Real Simulated</span>
          <span className="gradient-text-blue block">Mock Tests.</span>
        </h1>

        <p className="text-lg text-zinc-400 max-w-xl mt-4 mb-10 leading-relaxed">
          Stop ruining past papers by scrolling to answers. PaperBlast converts official PDFs into locked, timed mocks with NTA-accurate <strong className="text-zinc-200">+4/−1 scoring</strong>.
        </p>

        {/* CTA row */}
        <div className="flex flex-col sm:flex-row gap-4 items-center">
          <Link
            href="/auth/login"
            className="cta-glow text-black font-bold text-base px-8 py-4 rounded-full shadow-[0_0_40px_rgba(255,255,255,0.25)]"
          >
            Start Free Practice
          </Link>
          <Link
            href="#how-it-works"
            className="flex items-center gap-2 text-sm font-medium text-zinc-300 hover:text-white transition-colors border border-white/10 px-8 py-4 rounded-full hover:border-white/20 backdrop-blur-md bg-white/5"
          >
            <span className="w-6 h-6 rounded-full bg-white/10 flex items-center justify-center text-xs">▶</span>
            See how it works
          </Link>
        </div>

        {/* Social proof */}
        <div className="mt-12 flex items-center gap-6 text-sm text-zinc-500">
          <div className="flex -space-x-2">
            {["#3b82f6", "#8b5cf6", "#10b981", "#f59e0b", "#ef4444"].map((c, i) => (
              <div key={i} className="w-7 h-7 rounded-full border-2 border-[#09090b] flex items-center justify-center text-xs font-bold" style={{ backgroundColor: c }}>
                {String.fromCharCode(65 + i)}
              </div>
            ))}
          </div>
          <span><strong className="text-zinc-300">840+</strong> JEE aspirants joined this week</span>
        </div>

        {/* Mock UI preview card */}
        <div className="mt-20 w-full max-w-4xl mx-auto border-gradient rounded-2xl backdrop-blur-md bg-white/[0.02] p-px shadow-[0_0_80px_rgba(0,0,0,0.8),0_0_40px_rgba(255,255,255,0.03)] overflow-hidden">
          <div className="rounded-2xl bg-[#0d0d10] p-6">
            {/* Mock test header bar */}
            <div className="flex items-center justify-between mb-5 pb-4 border-b border-white/[0.07]">
              <div className="flex items-center gap-3">
                <div className="w-2 h-2 rounded-full bg-red-500" />
                <div className="w-2 h-2 rounded-full bg-yellow-500" />
                <div className="w-2 h-2 rounded-full bg-green-500" />
                <span className="ml-3 text-xs text-zinc-500">JEE Main 2023 · Session 2 · Paper 1</span>
              </div>
              <div className="flex items-center gap-3">
                <span className="font-mono text-sm text-amber-400 bg-amber-400/10 px-3 py-1 rounded-full">02:47:33</span>
                <span className="text-xs text-zinc-600 bg-zinc-800 px-2 py-1 rounded">75 Qs</span>
              </div>
            </div>
            {/* Subject tabs */}
            <div className="flex gap-2 mb-5">
              {[["Physics", "text-blue-400 bg-blue-400/10 border-blue-400/20"], ["Chemistry", "text-emerald-400 bg-emerald-400/10 border-emerald-400/20"], ["Mathematics", "text-violet-400 bg-violet-400/10 border-violet-400/20"]].map(([label, cls]) => (
                <span key={label} className={`text-xs font-medium px-3 py-1 rounded-full border ${cls}`}>{label}</span>
              ))}
            </div>
            {/* Fake question */}
            <div className="text-left">
              <p className="text-xs text-zinc-500 mb-2">Question 23 of 75</p>
              <p className="text-sm text-zinc-200 leading-relaxed mb-5">
                A particle of mass <span className="font-mono text-blue-300 bg-blue-900/30 px-1 rounded">m</span> moves in a circular orbit of radius <span className="font-mono text-blue-300 bg-blue-900/30 px-1 rounded">r</span>. The kinetic energy of the particle is proportional to:
              </p>
              <div className="grid grid-cols-2 gap-2">
                {["1/r²", "1/r", "r", "r²"].map((opt, i) => (
                  <div
                    key={i}
                    className={`flex items-center gap-3 px-4 py-3 rounded-xl border text-sm cursor-pointer transition-colors ${i === 1 ? "bg-blue-500/15 border-blue-500/40 text-blue-300" : "bg-white/[0.03] border-white/[0.07] text-zinc-400 hover:bg-white/[0.06]"}`}
                  >
                    <span className={`w-5 h-5 rounded-full border flex items-center justify-center text-xs font-bold ${i === 1 ? "border-blue-400 text-blue-400" : "border-zinc-600 text-zinc-600"}`}>
                      {String.fromCharCode(65 + i)}
                    </span>
                    <span className="font-mono">{opt}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Stats Section ── */}
      <section id="stats" className="relative z-10 py-20 px-6">
        <div className="max-w-5xl mx-auto grid grid-cols-2 md:grid-cols-4 gap-6">
          {[
            { num: "11K+", label: "Questions Extracted", color: "text-blue-400" },
            { num: "24", label: "Previous Year Papers", color: "text-violet-400" },
            { num: "99%", label: "Extraction Accuracy", color: "text-emerald-400" },
            { num: "180m", label: "NTA Timed Precision", color: "text-amber-400" },
          ].map(({ num, label, color }) => (
            <div key={label} className="stat-card border-gradient rounded-2xl p-6 text-center backdrop-blur-md bg-white/[0.02]">
              <div className={`text-4xl font-black mb-1 ${color}`}>{num}</div>
              <div className="text-xs text-zinc-500 leading-tight">{label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ── Features Section ── */}
      <section id="features" className="relative z-10 py-24 px-6">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16">
            <p className="text-xs font-semibold tracking-widest text-blue-400 uppercase mb-3">Why PaperBlast</p>
            <h2 className="text-4xl lg:text-5xl font-black tracking-tighter">
              Built for the <span className="gradient-text-blue">serious aspirant.</span>
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {[
              {
                icon: "🔒",
                title: "Sealed Answer Mode",
                desc: "Questions are served without solutions. You won't accidentally see answers while scrolling — just like the real exam.",
                accent: "border-blue-500/20 hover:shadow-blue-500/10",
              },
              {
                icon: "⏱️",
                title: "NTA-Accurate Timer",
                desc: "Strict 180-minute countdown per paper. Auto-submits when time expires. No extensions, no breaks.",
                accent: "border-amber-500/20 hover:shadow-amber-500/10",
              },
              {
                icon: "🧮",
                title: "±4/−1 Scoring",
                desc: "Marks calculated exactly as per NTA rules. Integer questions scored separately. See your predicted percentile instantly.",
                accent: "border-violet-500/20 hover:shadow-violet-500/10",
              },
              {
                icon: "📄",
                title: "Community Ingestion",
                desc: "Upload any official JEE PDF. Our pipeline extracts, chunks, and structures raw questions for peer review before publishing.",
                accent: "border-emerald-500/20 hover:shadow-emerald-500/10",
              },
              {
                icon: "🔍",
                title: "Deep Analytics",
                desc: "Post-submit review shows time-per-question, chapter-wise accuracy, and subject-wise mark distribution.",
                accent: "border-pink-500/20 hover:shadow-pink-500/10",
              },
              {
                icon: "🤝",
                title: "Open Contribution",
                desc: "Anyone can upload, extract, and verify questions. All papers go through community peer-review before going live.",
                accent: "border-cyan-500/20 hover:shadow-cyan-500/10",
              },
            ].map(({ icon, title, desc, accent }) => (
              <div
                key={title}
                className={`feature-card border-gradient rounded-2xl p-7 bg-white/[0.02] backdrop-blur-md ${accent} hover:shadow-lg`}
              >
                <div className="text-3xl mb-5">{icon}</div>
                <h3 className="text-lg font-bold text-white mb-2">{title}</h3>
                <p className="text-sm text-zinc-400 leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── How It Works Section ── */}
      <section id="how-it-works" className="relative z-10 py-24 px-6">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-16">
            <p className="text-xs font-semibold tracking-widest text-violet-400 uppercase mb-3">The Process</p>
            <h2 className="text-4xl lg:text-5xl font-black tracking-tighter">
              From PDF to <span className="gradient-text">mock in minutes.</span>
            </h2>
          </div>

          <div className="relative flex flex-col gap-0">
            {/* vertical line */}
            <div className="absolute left-6 top-8 bottom-8 w-px bg-gradient-to-b from-blue-500/60 via-violet-500/40 to-emerald-500/20" />

            {[
              {
                step: "01",
                title: "Upload a PDF",
                desc: "Any authenticated user can upload an official JEE paper PDF from NTA. Drag-drop or browse to upload.",
                color: "bg-blue-500",
                glow: "shadow-blue-500/40",
              },
              {
                step: "02",
                title: "Auto Extraction",
                desc: "Our pdf-parse pipeline rips the raw text and regex-chunks it into individual question blocks automatically.",
                color: "bg-violet-500",
                glow: "shadow-violet-500/40",
              },
              {
                step: "03",
                title: "Peer Review",
                desc: "A contributor verifies each question — corrects subject, answer options, and solution text in an inline editor.",
                color: "bg-amber-500",
                glow: "shadow-amber-500/40",
              },
              {
                step: "04",
                title: "Published & Playable",
                desc: "Once all questions are verified, the paper goes live. Any student can sit a timed mock and get instant results.",
                color: "bg-emerald-500",
                glow: "shadow-emerald-500/40",
              },
            ].map(({ step, title, desc, color, glow }, i) => (
              <div key={step} className="flex gap-8 pb-12 last:pb-0">
                <div className="relative flex-shrink-0 w-12">
                  <div className={`timeline-dot relative z-10 w-12 h-12 rounded-full ${color} shadow-lg ${glow} flex items-center justify-center text-sm font-black text-white`}>
                    {step}
                  </div>
                </div>
                <div className="pt-2 pb-4">
                  <h3 className="text-xl font-bold text-white mb-2">{title}</h3>
                  <p className="text-sm text-zinc-400 leading-relaxed max-w-md">{desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA Banner ── */}
      <section className="relative z-10 py-24 px-6">
        <div className="max-w-4xl mx-auto">
          <div className="border-gradient rounded-3xl p-px overflow-hidden">
            <div className="rounded-3xl bg-gradient-to-br from-[#0f0f13] to-[#09090b] p-12 text-center relative overflow-hidden">
              {/* Inner glow */}
              <div className="absolute inset-0 bg-gradient-to-r from-blue-600/10 via-violet-600/10 to-emerald-600/10 pointer-events-none" />

              <h2 className="text-4xl lg:text-6xl font-black tracking-tighter mb-4 relative z-10">
                Ready to <span className="gradient-text-blue">dominate</span><br />your next mock?
              </h2>
              <p className="text-zinc-400 mb-8 relative z-10">
                Join thousands of aspirants already practicing on real NTA papers.
              </p>
              <Link
                href="/auth/login"
                className="cta-glow inline-block text-black font-black text-lg px-10 py-5 rounded-full shadow-[0_0_60px_rgba(255,255,255,0.3)] relative z-10"
              >
                Create free account →
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="relative z-10 border-t border-white/[0.06] backdrop-blur-md bg-black/20 px-6 py-10">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-md bg-white flex items-center justify-center">
              <span className="text-black font-black text-xs">P</span>
            </div>
            <span className="font-bold text-sm">PaperBlast</span>
          </div>
          <p className="text-xs text-zinc-600">© 2025 PaperBlast · Community-driven JEE practice platform</p>
          <div className="flex gap-5 text-xs text-zinc-600">
            <Link href="/auth/login" className="hover:text-zinc-300 transition-colors">Login</Link>
            <Link href="/dashboard" className="hover:text-zinc-300 transition-colors">Dashboard</Link>
          </div>
        </div>
      </footer>

    </div>
  )
}
