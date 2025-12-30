import Link from "next/link";
import Image from "next/image";

export default function HomePage() {
  return (
    <div className="flex min-h-screen bg-stone-50 relative overflow-hidden">
      {/* Floating header */}
      <header className="fixed top-0 left-0 right-0 z-50 bg-stone-50/80 backdrop-blur-sm border-b border-black/5 overflow-visible">
        <nav className="flex items-center justify-between px-8 py-0 max-w-7xl mx-auto">
          <Link href="/home" className="hover:opacity-70 transition-opacity flex items-center">
            <Image src="/logo.png" alt="Clai" width={180} height={60} className="h-36 w-auto -my-6" />
          </Link>
          <div className="flex items-center gap-8">
            <a href="/" className="text-black font-light hover:text-black/70 transition-colors">
              Home
            </a>
            <a href="#projects" className="text-black font-light hover:text-black/70 transition-colors">
              Projects
            </a>
            <a href="#settings" className="text-black font-light hover:text-black/70 transition-colors">
              Settings
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

      <main className="w-full max-w-7xl mx-auto px-8 py-24 relative z-10 mt-16">
        <div className="animate-fade-in">
          <h1 className="text-5xl md:text-6xl font-bold text-black tracking-tight leading-none mb-4">
            Start Designing
          </h1>
          <div className="h-1 w-20 bg-black/10 mb-8" />
        </div>

        <div className="flex flex-col gap-6 mt-12 max-w-2xl">
          {/* New Project + button */}
          <button className="bg-white/50 backdrop-blur-sm border border-black/5 p-4 hover:border-black/10 transition-all duration-300 animate-fade-in-delay-1 flex items-center justify-center aspect-square max-w-[200px]">
            <span className="text-4xl font-light text-black">+</span>
          </button>
        </div>

        {/* Templates section */}
        <div className="mt-16 animate-fade-in-delay-2">
          <h2 className="text-3xl font-semibold text-black mb-6">Templates</h2>
          <div className="bg-white/50 backdrop-blur-sm border border-black/5 p-6">
            <input
              type="text"
              placeholder="Search templates..."
              className="w-full px-4 py-3 bg-transparent border-0 border-b border-black/10 text-black placeholder:text-black/30 font-light focus:outline-none focus:border-black/30 transition-all duration-300 mb-4"
            />
            <p className="text-black/60 font-light">No templates found. Browse the template library to get started.</p>
          </div>
        </div>

        {/* Recent activity section */}
        <div className="mt-16 animate-fade-in-delay-3">
          <h2 className="text-3xl font-semibold text-black mb-6">Recent Activity</h2>
          <div className="bg-white/50 backdrop-blur-sm border border-black/5 p-6">
            <p className="text-black/60 font-light">No recent activity. Start creating your first project!</p>
          </div>
        </div>

        {/* Projects section */}
        <div className="mt-16 animate-fade-in-delay-4" id="projects">
          <h2 className="text-3xl font-semibold text-black mb-6">Projects</h2>
          <div className="bg-white/50 backdrop-blur-sm border border-black/5 p-6">
            <p className="text-black/60 font-light">No projects yet. Create your first project to get started!</p>
          </div>
        </div>
      </main>
    </div>
  );
}

