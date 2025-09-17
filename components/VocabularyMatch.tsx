"use client";

import React from "react";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  DragOverlay,
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
  sortableKeyboardCoordinates,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

export type Word = {
  id: string;
  en: string;
  de: string;
};

const vocab: Word[] = [
  { id: "1", en: "apple", de: "Apfel" },
  { id: "2", en: "house", de: "Haus" },
  { id: "3", en: "book", de: "Buch" },
  { id: "4", en: "car", de: "Auto" },
  { id: "5", en: "water", de: "Wasser" },
  { id: "6", en: "friend", de: "Freund" },
];

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function SortableDeCell({ word, correct }: { word: Word; correct: boolean }) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: word.id });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={
        `p-3 border-b border-border text-sm text-foreground rounded-md cursor-grab active:cursor-grabbing select-none bg-card ` +
        (isDragging ? "ring-2 ring-primary/60 shadow" : "") +
        (correct ? " invert" : " hover:bg-[var(--hover)]")
      }
      {...attributes}
      {...listeners}
      aria-label={`Drag German word: ${word.de}`}
    >
      {word.de}
    </div>
  );
}

function DeOverlay({ word }: { word?: Word }) {
  if (!word) return null;
  return (
    <div className="p-3 text-sm rounded-md border border-border bg-card text-foreground shadow">
      {word.de}
    </div>
  );
}

export default function VocabularyMatch() {
  // Deterministic initial order for SSR; shuffle only when the user clicks the button
  const [order, setOrder] = React.useState<string[]>(() =>
    vocab.map((w) => w.id)
  );
  const [activeId, setActiveId] = React.useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const germanById = React.useMemo(
    () =>
      Object.fromEntries(vocab.map((w) => [w.id, w])) as Record<string, Word>,
    []
  );

  const germanList: Word[] = order.map((id) => germanById[id]);

  function handleDragStart(event: any) {
    setActiveId(event.active.id as string);
  }

  // SWAP ONLY ON DROP
  function handleDragEnd(event: any) {
    const { active, over } = event;
    setActiveId(null);
    if (!over || active.id === over.id) return;

    setOrder((items) => {
      const from = items.indexOf(active.id);
      const to = items.indexOf(over.id);
      if (from === -1 || to === -1) return items;
      const next = [...items];
      [next[from], next[to]] = [next[to], next[from]];
      return next;
    });
  }

  const activeWord = activeId ? germanById[activeId] : undefined;

  const correctCount = germanList.reduce(
    (acc, w, i) => (w.id === vocab[i].id ? acc + 1 : acc),
    0
  );
  const allCorrect = correctCount === vocab.length;

  return (
    <div className="mx-auto max-w-3xl p-6">
      <div className="vocab-theme rounded-2xl border border-border p-4 bg-card text-foreground">
        <h1 className="mb-2 text-2xl font-bold tracking-tight">
          Vocabulary Match (EN → DE)
        </h1>
        <p className="mb-4 text-muted-foreground text-sm">
          Drag the <span className="font-medium">German</span> words (right
          column) to line them up with their
          <span className="font-medium"> English</span> translations on the
          left.
        </p>

        <div className="mb-4 flex items-center justify-between">
          <div
            className={`text-sm font-medium ${
              allCorrect ? "text-[var(--primary)]" : "text-muted-foreground"
            }`}
          >
            Score: {correctCount} / {vocab.length}{" "}
            {allCorrect ? "— Well done! 🎉" : ""}
          </div>
          <div className="space-x-2">
            <button
              className="rounded-xl border border-border px-3 py-1.5 text-sm bg-card hover:bg-[var(--hover)]"
              onClick={() => setOrder(shuffle(vocab.map((w) => w.id)))}
            >
              Shuffle
            </button>
            <button
              className="rounded-xl border border-border px-3 py-1.5 text-sm bg-card hover:bg-[var(--hover)]"
              onClick={() => setOrder(vocab.map((w) => w.id))}
            >
              Reveal correct order
            </button>
          </div>
        </div>

        {/* Two columns: EN (fixed), DE (sortable) */}
        <div className="grid grid-cols-2 gap-4">
          {/* Header row */}
          <div className="text-xs uppercase tracking-wide text-muted-foreground">
            English
          </div>
          <div className="text-xs uppercase tracking-wide text-muted-foreground">
            German (drag)
          </div>

          {/* Left fixed column */}
          <div className="rounded-2xl border border-border overflow-hidden bg-card">
            {vocab.map((w, i) => (
              <div
                key={w.id}
                className={`p-3 border-b border-border last:border-b-0 text-sm text-foreground bg-card ${
                  germanList[i]?.id === w.id ? "invert" : ""
                }`}
              >
                {w.en}
              </div>
            ))}
          </div>

          {/* Right sortable column */}
          <div className="rounded-2xl border border-border overflow-hidden bg-card">
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragStart={handleDragStart}
              onDragEnd={handleDragEnd}
            >
              <SortableContext
                items={order}
                strategy={verticalListSortingStrategy}
              >
                {germanList.map((w, i) => (
                  <SortableDeCell
                    key={w.id}
                    word={w}
                    correct={w.id === vocab[i].id}
                  />
                ))}
              </SortableContext>

              <DragOverlay dropAnimation={null}>
                <DeOverlay word={activeWord} />
              </DragOverlay>
            </DndContext>
          </div>
        </div>
      </div>
    </div>
  );
}
