import Link from "next/link";
import Image from "next/image";

export default function Home() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-stone-50 relative overflow-hidden">
      {/* Floating header */}
      <header className="fixed top-0 left-0 right-0 z-50 bg-stone-50/80 backdrop-blur-sm border-b border-black/5 overflow-visible">
        <nav className="flex items-center justify-between px-8 py-0 max-w-7xl mx-auto">
          <Link href="/home" className="hover:opacity-70 transition-opacity flex items-center">
            <Image src="/logo.png" alt="Clai" width={180} height={60} className="h-36 w-auto -my-6" />
          </Link>
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
          <Image src="/logo.png" alt="Clai" width={400} height={133} className="w-64 md:w-80 h-auto" />
          <div className="h-1 w-20 bg-black/10" />
        </div>

        <p className="text-3xl md:text-4xl text-black font-light tracking-tight max-w-2xl leading-tight animate-fade-in-delay-1">
        Turn product ideas into factory-ready designs without a design background.
        </p>*

        <div className="animate-fade-in-delay-2 mt-4">
          <Link href="/home">
            <button className="px-8 py-4 bg-black text-white font-bold tracking-wide transition-all duration-300 hover:bg-black hover:scale-105 active:scale-100">
              Start Designing
            </button>
          </Link>
        </div>
      </main>
    </div>
  );
}
