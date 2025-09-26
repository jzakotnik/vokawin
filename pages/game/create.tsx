import Image from "next/image";
import { Geist, Geist_Mono } from "next/font/google";
import type { NextPage } from "next";
import Head from "next/head";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Gamepad2, Users } from "lucide-react";
import VocabularyMatch from "@/components/VocabularyMatch";
import { NewGameForm } from "@/components/game/NewGameForm";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export default function Create() {
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
          <NewGameForm />
        </div>
      </main>
    </>
  );
}
