import Link from "next/link"

export default function Home() {
  return (
    <div className="min-h-screen bg-black text-foreground selection:bg-primary selection:text-primary-foreground dark relative overflow-hidden">
      {/* Background gradients */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-zinc-900 overflow-hidden via-black to-black -z-10" />

      {/* Navbar */}
      <header className="flex items-center justify-between px-8 py-6 w-full max-w-7xl mx-auto backdrop-blur-sm bg-black/30 border-b border-white/10 rounded-b-3xl absolute top-0 left-1/2 -translate-x-1/2 z-50">
        <div className="flex items-center space-x-2">
          <div className="w-8 h-8 bg-white rounded-lg flex items-center justify-center">
            <span className="text-black font-black text-xl">P</span>
          </div>
          <span className="text-xl font-bold tracking-tight text-white">PaperBlast</span>
        </div>
        <nav className="hidden md:flex space-x-8">
          <Link href="#features" className="text-sm font-medium text-zinc-400 hover:text-white transition-colors">Features</Link>
          <Link href="#how-it-works" className="text-sm font-medium text-zinc-400 hover:text-white transition-colors">How it works</Link>
          <Link href="/dashboard" className="text-sm font-medium text-zinc-400 hover:text-white transition-colors">Dashboard</Link>
        </nav>
        <Link
          href="/auth/login"
          className="bg-white text-black px-5 py-2 rounded-full text-sm font-semibold hover:bg-zinc-200 transition-colors"
        >
          Get Started
        </Link>
      </header>

      {/* Hero Section */}
      <main className="flex flex-col items-center justify-center min-h-[90vh] px-6 text-center pt-24 z-10 relative">
        <div className="inline-flex items-center rounded-full border border-zinc-800 bg-zinc-900/50 px-3 py-1 text-sm text-zinc-300 mb-8 backdrop-blur-md">
          <span className="flex h-2 w-2 rounded-full bg-green-500 mr-2 animate-pulse"></span>
          Now supporting JEE Main 2024 Papers
        </div>

        <h1 className="text-5xl md:text-7xl font-bold tracking-tighter text-transparent bg-clip-text bg-gradient-to-b from-white to-zinc-500 max-w-4xl mb-6">
          Master JEE with True <br /> Simulated Mock Exams.
        </h1>

        <p className="text-lg md:text-xl text-zinc-400 max-w-2xl mb-10 leading-relaxed">
          Stop spoiling answers while practicing past papers. We extract official PDFs into interactive, timed mocks with strict NTA scoring logic.
        </p>

        <div className="flex flex-col sm:flex-row space-y-4 sm:space-y-0 sm:space-x-4">
          <Link
            href="/auth/login"
            className="px-8 py-4 rounded-full bg-white text-black font-bold hover:scale-105 transition-transform shadow-[0_0_40px_rgba(255,255,255,0.3)]"
          >
            Start Practicing Now
          </Link>
          <Link
            href="#features"
            className="px-8 py-4 rounded-full bg-zinc-900 border border-zinc-800 text-white font-semibold hover:bg-zinc-800 transition-colors"
          >
            View Features
          </Link>
        </div>

        {/* Feature Cards Matrix */}
        <div id="features" className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-32 max-w-6xl mx-auto px-4 w-full">
          <div className="flex flex-col text-left p-8 rounded-3xl bg-zinc-900/40 border border-white/5 backdrop-blur-md hover:bg-zinc-800/50 transition-colors">
            <div className="w-12 h-12 bg-white/10 rounded-2xl flex items-center justify-center mb-6">
              <span className="text-2xl">⚡</span>
            </div>
            <h3 className="text-xl font-bold text-white mb-3">Smart Extraction</h3>
            <p className="text-zinc-400">Our ingestion pipeline reads unstructured PDFs and maps them cleanly to randomized database questions.</p>
          </div>

          <div className="flex flex-col text-left p-8 rounded-3xl bg-zinc-900/40 border border-white/5 backdrop-blur-md hover:bg-zinc-800/50 transition-colors">
            <div className="w-12 h-12 bg-white/10 rounded-2xl flex items-center justify-center mb-6">
              <span className="text-2xl">⏱️</span>
            </div>
            <h3 className="text-xl font-bold text-white mb-3">Timed Mocks</h3>
            <p className="text-zinc-400">Experience a strict 180-minute countdown with NTA-standard +4/-1 scoring to build exam temperament.</p>
          </div>

          <div className="flex flex-col text-left p-8 rounded-3xl bg-zinc-900/40 border border-white/5 backdrop-blur-md hover:bg-zinc-800/50 transition-colors">
            <div className="w-12 h-12 bg-white/10 rounded-2xl flex items-center justify-center mb-6">
              <span className="text-2xl">📊</span>
            </div>
            <h3 className="text-xl font-bold text-white mb-3">Deep Review</h3>
            <p className="text-zinc-400">Instantly auto-grade submissions and reveal step-by-step solutions with detailed subject-wise insights.</p>
          </div>
        </div>
      </main>
    </div>
  )
}
