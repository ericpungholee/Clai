export default function Home() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-stone-50 relative overflow-hidden">
      {/* Floating header */}
      <header className="fixed top-0 left-0 right-0 z-50 bg-stone-50/80 backdrop-blur-sm border-b border-black/5">
        <nav className="flex items-center justify-between px-8 py-4 max-w-7xl mx-auto">
          <div className="text-3xl font-semibold text-black">
            Clai
          </div>
          <div className="flex items-center gap-8">
            <a href="#about" className="text-black font-light hover:text-black/70 transition-colors">
              About
            </a>
            <a href="#signup" className="text-black font-light hover:text-black/70 transition-colors">
              Sign Up
            </a>
          </div>
        </nav>
      </header>

      {/* Subtle background pattern */}
      <div className="absolute inset-0 opacity-[0.02]">
        <div className="absolute inset-0" style={{
          backgroundImage: `radial-gradient(circle at 1px 1px, black 1px, transparent 0)`,
          backgroundSize: '40px 40px'
        }} />
      </div>

      <main className="flex flex-col items-center gap-10 text-center px-8 max-w-3xl relative z-10 py-20">
        <div className="flex flex-col items-center gap-4 animate-fade-in">
          <h1 className="text-7xl md:text-8xl font-bold text-black tracking-tight leading-none">
            Clai
          </h1>
          <div className="h-1 w-20 bg-black/10" />
        </div>

        <p className="text-3xl md:text-4xl text-black font-light tracking-tight max-w-2xl leading-tight animate-fade-in-delay-1">
          AI editor for designing physical products.
        </p>

        <div className="animate-fade-in-delay-2 mt-4">
          <button className="px-8 py-4 bg-black text-white font-bold tracking-wide transition-all duration-300 hover:bg-black hover:scale-105 active:scale-100">
            Start Designing
          </button>
        </div>
      </main>
    </div>
  );
}
