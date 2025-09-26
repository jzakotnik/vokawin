import Image from "next/image";
import { Geist, Geist_Mono } from "next/font/google";
import type { NextPage } from "next";
import Head from "next/head";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Gamepad2, Users } from "lucide-react";
import VocabularyMatch from "@/components/VocabularyMatch";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export default function Home() {
  return (
    <>
      <Head>
        <title>Spiel Lobby</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </Head>

      <main
        className={`${geistSans.variable} ${geistMono.variable} min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center px-6`}
      >
        <div className="w-full max-w-5xl">
          <h1 className="text-center text-3xl md:text-4xl font-semibold tracking-tight mb-10">
            Willkommen bei VokaWin und viel Erfolg!
          </h1>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 md:gap-8">
            {/* Erzeuge Spiel */}
            <Button
              asChild
              aria-label="Erzeuge Spiel"
              className="
                group relative aspect-square w-full rounded-3xl
                p-6
                bg-[radial-gradient(120%_120%_at_80%_-10%,rgba(255,255,255,0.06),rgba(255,255,255,0)_60%)]
                bg-slate-900/60
                backdrop-blur-md
                border border-white/10
                shadow-[0_10px_30px_rgba(0,0,0,0.45),inset_0_1px_0_rgba(255,255,255,0.06)]
                text-slate-100
                transition will-change-transform
                hover:-translate-y-1 hover:shadow-[0_18px_50px_rgba(0,0,0,0.55),inset_0_1px_0_rgba(255,255,255,0.1)]
                focus-visible:ring-4 focus-visible:ring-white/20
              "
            >
              <Link
                href="/game/create"
                className="flex h-full w-full items-center justify-center"
              >
                {/* subtle grain */}
                <span
                  aria-hidden
                  className="pointer-events-none absolute inset-0 rounded-3xl opacity-20 mix-blend-soft-light"
                  style={{
                    backgroundImage:
                      "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='160' height='160' viewBox='0 0 160 160'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/><feColorMatrix type='saturate' values='0'/><feComponentTransfer><feFuncA type='table' tableValues='0 0 0 0 0.15 0.3 0.5 0.6'/></feComponentTransfer></filter><rect width='100%' height='100%' filter='url(%23n)'/></svg>\")",
                  }}
                />
                {/* glossy top edge */}
                <span className="pointer-events-none absolute inset-0 rounded-3xl bg-gradient-to-b from-white/10 via-transparent to-transparent" />

                <span className="relative z-10 flex flex-col items-center justify-center gap-4">
                  <Gamepad2
                    className="h-12 w-12 md:h-14 md:w-14 text-slate-200 transition-transform duration-200 group-hover:-translate-y-0.5"
                    aria-hidden
                  />
                  <span className="text-2xl md:text-3xl font-semibold tracking-wide">
                    Erzeuge Spiel
                  </span>
                </span>

                {/* corner accent */}
                <span className="pointer-events-none absolute top-4 left-4 h-10 w-10 rounded-xl bg-white/[0.03] ring-1 ring-white/10" />
              </Link>
            </Button>

            {/* Teilnehmen */}
            <Button
              asChild
              aria-label="Teilnehmen"
              className="
                group relative aspect-square w-full rounded-3xl
                p-6
                bg-[radial-gradient(120%_120%_at_20%_-10%,rgba(255,255,255,0.06),rgba(255,255,255,0)_60%)]
                bg-slate-900/60
                backdrop-blur-md
                border border-white/10
                shadow-[0_10px_30px_rgba(0,0,0,0.45),inset_0_1px_0_rgba(255,255,255,0.06)]
                text-slate-100
                transition will-change-transform
                hover:-translate-y-1 hover:shadow-[0_18px_50px_rgba(0,0,0,0.55),inset_0_1px_0_rgba(255,255,255,0.1)]
                focus-visible:ring-4 focus-visible:ring-white/20
              "
            >
              <Link
                href="/game/join"
                className="flex h-full w-full items-center justify-center"
              >
                {/* subtle grain */}
                <span
                  aria-hidden
                  className="pointer-events-none absolute inset-0 rounded-3xl opacity-20 mix-blend-soft-light"
                  style={{
                    backgroundImage:
                      "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='160' height='160' viewBox='0 0 160 160'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/><feColorMatrix type='saturate' values='0'/><feComponentTransfer><feFuncA type='table' tableValues='0 0 0 0 0.15 0.3 0.5 0.6'/></feComponentTransfer></filter><rect width='100%' height='100%' filter='url(%23n)'/></svg>\")",
                  }}
                />
                {/* glossy top edge */}
                <span className="pointer-events-none absolute inset-0 rounded-3xl bg-gradient-to-b from-white/10 via-transparent to-transparent" />

                <span className="relative z-10 flex flex-col items-center justify-center gap-4">
                  <Users
                    className="h-12 w-12 md:h-14 md:w-14 text-slate-200 transition-transform duration-200 group-hover:-translate-y-0.5"
                    aria-hidden
                  />
                  <span className="text-2xl md:text-3xl font-semibold tracking-wide">
                    Teilnehmen
                  </span>
                </span>

                {/* corner accent */}
                <span className="pointer-events-none absolute bottom-4 right-4 h-10 w-10 rounded-xl bg-white/[0.03] ring-1 ring-white/10" />
              </Link>
            </Button>
          </div>
        </div>
      </main>
    </>
  );
}
