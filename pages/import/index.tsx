/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import React, { useCallback, useMemo } from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Loader2, Upload, Database } from "lucide-react";
import { useState } from "react";

// Types
export type PreviewRow = {
  col1: string;
  col2: string;
  rowNumber: number;
};

type Status = "idle" | "parsing" | "ready" | "importing" | "imported";

function cellToString(v: any): string {
  if (v == null) return "";
  if (v instanceof Date) return v.toISOString();
  if (typeof v === "object") {
    // exceljs cell values can be richText, formula with result, hyperlink objects, etc
    // Try common cases without being too picky
    if (Array.isArray((v as any).richText)) {
      return (v as any).richText.map((t: any) => t.text).join("");
    }
    if ((v as any).text) return String((v as any).text);
    if ((v as any).result != null) return String((v as any).result);
    if ((v as any).hyperlink)
      return String((v as any).text ?? (v as any).hyperlink);
    if ((v as any).formula)
      return String((v as any).result ?? (v as any).formula);
  }
  return String(v);
}

export default function VocabImportPage() {
  const [status, setStatus] = useState<Status>("idle");
  const [fileName, setFileName] = useState<string | null>(null);
  const [headers, setHeaders] = useState<[string, string]>([
    "Column 1",
    "Column 2",
  ]);
  const [preview, setPreview] = useState<PreviewRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [importedCount, setImportedCount] = useState<number | null>(null);

  const hasData = preview.length > 0;

  const onFileChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      setError(null);
      setImportedCount(null);
      setStatus("parsing");

      try {
        const arrayBuffer = await file.arrayBuffer();

        // Dynamic import to keep bundle small and ensure it's only used client-side
        const ExcelJS = (await import("exceljs")).default;
        const workbook = new ExcelJS.Workbook();
        await workbook.xlsx.load(arrayBuffer);

        // Get the sheet named exactly "vocabulary", or try to find a similar one
        let worksheet = workbook.getWorksheet("vocabulary");
        if (!worksheet) {
          worksheet = workbook.worksheets.find((ws: any) =>
            String(ws.name || "")
              .toLowerCase()
              .includes("vocab")
          );
        }
        if (!worksheet) throw new Error('Sheet "vocabulary" not found');

        // Try to detect headers from first row
        const firstRow = worksheet.getRow(1);
        const detectedHeader1 =
          cellToString(firstRow.getCell(1).value) || "Column 1";
        const detectedHeader2 =
          cellToString(firstRow.getCell(2).value) || "Column 2";

        // Decide whether first row is header: if it contains any non-numeric text, treat as header
        const headerish = [detectedHeader1, detectedHeader2].some((h) =>
          /[A-Za-z]/.test(h)
        );
        const startRowIndex = headerish ? 2 : 1;

        const rows: PreviewRow[] = [];
        for (
          let r = startRowIndex;
          r <= worksheet.rowCount && rows.length < 100;
          r++
        ) {
          const row = worksheet.getRow(r);
          const c1 = cellToString(row.getCell(1).value).trim();
          const c2 = cellToString(row.getCell(2).value).trim();
          if (!c1 && !c2) continue; // skip blank rows
          rows.push({ col1: c1, col2: c2, rowNumber: r });
        }

        if (!rows.length)
          throw new Error("No data found in the first two columns.");

        setFileName(file.name);
        setHeaders([detectedHeader1, detectedHeader2]);
        setPreview(rows);
        setStatus("ready");
      } catch (err: any) {
        setError(err?.message || "Failed to parse Excel file");
        setStatus("idle");
      }
    },
    []
  );

  const handleImport = useCallback(async () => {
    if (!hasData) return;
    setStatus("importing");
    setError(null);

    try {
      const res = await fetch("/api/vocabulary/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          meta: {
            source: "Unit 3 - Book A",
            sourceLang: "en",
            targetLang: "de",
            comment: "Imported from Excel",
          },
          rows: preview, // [{ col1, col2, rowNumber }]
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Import failed");
      setImportedCount(Number(data?.inserted ?? preview.length));
      setStatus("imported");
    } catch (err: any) {
      setError(err?.message || "Import failed");
      setStatus("ready");
    }
  }, [hasData, preview]);

  const tableHeader = useMemo(() => headers, [headers]);

  return (
    <div className="container mx-auto max-w-5xl p-6">
      <Card className="shadow-sm">
        <CardHeader>
          <CardTitle className="text-2xl">Vocabulary Import</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-3">
            <Input
              type="file"
              accept=".xlsx,.xls"
              onChange={onFileChange}
              disabled={status === "parsing" || status === "importing"}
            />
            <Button variant="secondary" disabled>
              <Upload className="h-4 w-4 mr-2" /> Upload Excel
            </Button>
          </div>

          {fileName && (
            <p className="text-sm text-muted-foreground">
              Selected file: {fileName}
            </p>
          )}

          {status === "parsing" && (
            <Alert>
              <Loader2 className="h-4 w-4 animate-spin" />
              <AlertTitle className="ml-2">Reading Excel…</AlertTitle>
              <AlertDescription className="ml-6">
                Loading the sheet named vocabulary and parsing up to 100 rows.
              </AlertDescription>
            </Alert>
          )}

          {error && (
            <Alert variant="destructive">
              <AlertTitle>Something went wrong</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {hasData && (
            <div className="rounded-lg border overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-20">#</TableHead>
                    <TableHead>{tableHeader[0]}</TableHead>
                    <TableHead>{tableHeader[1]}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {preview.map((r) => (
                    <TableRow key={r.rowNumber}>
                      <TableCell className="text-muted-foreground">
                        {r.rowNumber}
                      </TableCell>
                      <TableCell className="whitespace-pre-wrap">
                        {r.col1}
                      </TableCell>
                      <TableCell className="whitespace-pre-wrap">
                        {r.col2}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>

        <CardFooter className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            {hasData
              ? `Previewing ${preview.length} row(s).`
              : "No data loaded yet."}
          </p>

          <div className="flex items-center gap-2">
            <Button
              onClick={handleImport}
              disabled={!hasData || status === "importing"}
            >
              {status === "importing" ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Importing…
                </>
              ) : (
                <>
                  <Database className="h-4 w-4 mr-2" />
                  Insert into DB
                </>
              )}
            </Button>
          </div>
        </CardFooter>
      </Card>

      {status === "imported" && (
        <div className="mt-4">
          <Alert>
            <AlertTitle>Import complete</AlertTitle>
            <AlertDescription>
              Inserted {importedCount ?? preview.length} row(s) into the
              database.
            </AlertDescription>
          </Alert>
        </div>
      )}
    </div>
  );
}
