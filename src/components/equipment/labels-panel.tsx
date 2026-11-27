"use client";
import { useState } from "react";
import { DownloadButton } from "./download";
export function LabelsPanel({ ids }: { ids: string[] }) {
  const [start, setStart] = useState(1),
    [top, setTop] = useState(15.15),
    [left, setLeft] = useState(7.25);
  return (
    <details className="max-w-full rounded-xl border bg-card p-3">
      <summary className="cursor-pointer text-sm font-medium">
        Étiquettes L7160 ({ids.length})
      </summary>
      <div className="mt-4 flex flex-wrap items-end gap-3">
        <label className="w-32 text-xs">
          Première position
          <input
            className="field mt-2"
            type="number"
            min="1"
            max="21"
            value={start}
            onChange={(e) => setStart(Number(e.target.value))}
          />
        </label>
        <label className="w-32 text-xs">
          Marge haute (mm)
          <input
            className="field mt-2"
            type="number"
            step="0.05"
            min="0"
            max="30"
            value={top}
            onChange={(e) => setTop(Number(e.target.value))}
          />
        </label>
        <label className="w-32 text-xs">
          Marge gauche (mm)
          <input
            className="field mt-2"
            type="number"
            step="0.05"
            min="0"
            max="12"
            value={left}
            onChange={(e) => setLeft(Number(e.target.value))}
          />
        </label>
        <DownloadButton
          url="/api/equipment/labels"
          filename="harnois-etiquettes.pdf"
          body={{
            ids,
            format: "sheet",
            startPosition: start,
            marginTop: top,
            marginLeft: left,
          }}
        >
          Générer la planche
        </DownloadButton>
        {ids.length === 1 && (
          <DownloadButton
            url="/api/equipment/labels"
            filename="harnois-etiquette.pdf"
            body={{ ids, format: "single" }}
          >
            Étiquette individuelle
          </DownloadButton>
        )}
      </div>
      <p className="mt-3 text-xs text-muted-foreground">
        A4 · 21 étiquettes de 63,5 × 38,1 mm. Imprimer à 100 %, sans ajuster à
        la page.
      </p>
    </details>
  );
}
