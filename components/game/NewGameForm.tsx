"use client";

import React, { useEffect, useState } from "react";
import { useForm, Controller } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Command,
  CommandInput,
  CommandList,
  CommandItem,
  CommandEmpty,
} from "@/components/ui/command";
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from "@/components/ui/popover";
import { Save, Loader2, ChevronsUpDown, Check } from "lucide-react";
import { cn } from "@/lib/utils";

// --- Types & Schema ---------------------------------------------------------
const GameFormSchema = z.object({
  name: z.string().trim().min(3, { message: "Bitte gib deinen Namen ein" }),
  vocabularySource: z
    .string()
    .min(1, { message: "Bitte wähle eine Vokabelquelle" }),
  firstWord: z.string().min(1, { message: "Bitte wähle das erste Wort" }),
  lastWord: z.string().min(1, { message: "Bitte wähle das letzte Wort" }),
});

export type GameFormValues = z.infer<typeof GameFormSchema>;

// Beispiel-Quellenliste
const vocabularySources = [
  { id: "book1", label: "Buch 1" },
  { id: "book2", label: "Buch 2" },
];

export function NewGameForm() {
  const [submitting, setSubmitting] = useState(false);
  const [vocabularySources, setVocabularySources] = useState<
    { id: string; label: string }[]
  >([]);
  const [words, setWords] = useState<string[]>([]);
  const form = useForm<GameFormValues>({
    resolver: zodResolver(GameFormSchema),
    defaultValues: {
      name: "",
      vocabularySource: "",
      firstWord: "",
      lastWord: "",
    },
  });
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/vocabulary/sources");
        if (!res.ok) throw new Error("Fehler beim Laden der Vokabelquellen");
        const data: { id: string; label: string }[] = await res.json();
        setVocabularySources(data);
      } catch (err) {
        console.error(err);
        setVocabularySources([]);
      }
    })();
  }, []);

  // Wörter laden, wenn sich die Quelle ändert
  const source = form.watch("vocabularySource");
  useEffect(() => {
    if (!source) return;
    (async () => {
      try {
        const res = await fetch(`/api/vocabulary?source=${source}`);
        if (!res.ok) throw new Error("Fehler beim Laden der Wörter");
        const jsonRes = await res.json();
        console.log("Received these words from API", jsonRes);
        const data: string[] = jsonRes[0].sourceWords;

        setWords(data);
      } catch (err) {
        console.error(err);
        setWords([]);
      }
    })();
  }, [source]);

  const onSubmit = async (values: GameFormValues) => {
    setSubmitting(true);
    try {
      const res = await fetch("/api/games", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });
      if (!res.ok) throw new Error(await res.text());
      const created = await res.json();
      window.location.href = `/games/${created._id}`;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (err: any) {
      alert(err?.message ?? "Spiel konnte nicht erstellt werden");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="mx-auto max-w-2xl p-4 md:p-8">
      <Card className="shadow-sm">
        <CardHeader>
          <CardTitle>Neues Spiel erstellen</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            {/* Benutzername */}
            <div>
              <Label htmlFor="name">Mein Name</Label>
              <Input
                id="name"
                placeholder="z. B. Anna"
                {...form.register("name" as const)}
              />
              {form.formState.errors.name && (
                <p className="mt-1 text-sm text-destructive">
                  {form.formState.errors.name.message}
                </p>
              )}
            </div>

            {/* Vokabelquelle */}
            <div>
              <Label>Vokabelquelle</Label>
              <Controller
                control={form.control}
                name="vocabularySource"
                render={({ field }) => (
                  <select
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    value={field.value}
                    onChange={(e) => field.onChange(e.target.value)}
                  >
                    <option value="">Bitte Buch auswählen</option>
                    {vocabularySources.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.label}
                      </option>
                    ))}
                  </select>
                )}
              />
              {form.formState.errors.vocabularySource && (
                <p className="mt-1 text-sm text-destructive">
                  {form.formState.errors.vocabularySource.message}
                </p>
              )}
            </div>

            {/* Erstes Wort */}
            <div>
              <Label>Erstes Wort</Label>
              <AutocompleteField
                name="firstWord"
                control={form.control}
                options={words}
                placeholder="Tippe oder wähle das erste Wort"
              />
              {form.formState.errors.firstWord && (
                <p className="mt-1 text-sm text-destructive">
                  {form.formState.errors.firstWord.message}
                </p>
              )}
            </div>

            {/* Letztes Wort */}
            <div>
              <Label>Letztes Wort</Label>
              <AutocompleteField
                name="lastWord"
                control={form.control}
                options={words}
                placeholder="Tippe oder wähle das letzte Wort"
              />
              {form.formState.errors.lastWord && (
                <p className="mt-1 text-sm text-destructive">
                  {form.formState.errors.lastWord.message}
                </p>
              )}
            </div>

            {/* Absenden */}
            <Button type="submit" disabled={submitting}>
              {submitting ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Save className="mr-2 h-4 w-4" />
              )}
              Spiel erstellen
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

// Autocomplete-Feld-Komponente mit shadcn/ui Command + Popover
function AutocompleteField({
  name,
  control,
  options,
  placeholder,
}: {
  name: "firstWord" | "lastWord";
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  control: any;
  options: string[];
  placeholder: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Controller
      control={control}
      name={name}
      render={({ field }) => (
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              role="combobox"
              className="w-full justify-between"
            >
              {field.value || placeholder}
              <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-full p-0">
            <Command>
              <CommandInput placeholder={placeholder} />
              <CommandList>
                <CommandEmpty>Keine Ergebnisse gefunden.</CommandEmpty>
                {options.map((opt) => (
                  <CommandItem
                    key={opt}
                    value={opt}
                    onSelect={() => {
                      field.onChange(opt);
                      setOpen(false);
                    }}
                  >
                    <Check
                      className={cn(
                        "mr-2 h-4 w-4",
                        field.value === opt ? "opacity-100" : "opacity-0"
                      )}
                    />
                    {opt}
                  </CommandItem>
                ))}
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
      )}
    />
  );
}
