"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { IScannerControls } from "@zxing/browser";
import { scannedEquipmentPath } from "@/lib/equipment-qr";
import { Button } from "@/components/ui/button";
import { Camera, ScanLine } from "lucide-react";
export function EquipmentScanner({ origin }: { origin: string }) {
  const video = useRef<HTMLVideoElement>(null),
    controls = useRef<IScannerControls | null>(null),
    generation = useRef(0),
    router = useRouter();
  const [running, setRunning] = useState(false),
    [error, setError] = useState("");
  function stop() {
    generation.current++;
    controls.current?.stop();
    controls.current = null;
    setRunning(false);
  }
  useEffect(
    () => () => {
      generation.current++;
      controls.current?.stop();
    },
    [],
  );
  async function start() {
    setError("");
    stop();
    const token = generation.current;
    setRunning(true);
    try {
      if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia)
        throw new Error("La caméra nécessite HTTPS ou localhost.");
      const { BrowserQRCodeReader } = await import("@zxing/browser");
      const reader = new BrowserQRCodeReader();
      const active = await reader.decodeFromConstraints(
        { video: { facingMode: { ideal: "environment" } }, audio: false },
        video.current!,
        (result) => {
          if (!result || generation.current !== token) return;
          try {
            const target = scannedEquipmentPath(result.getText(), origin);
            stop();
            router.push(target);
          } catch (e) {
            setError(e instanceof Error ? e.message : "QR non reconnu.");
          }
        },
      );
      if (generation.current !== token) active.stop();
      else controls.current = active;
    } catch (e) {
      if (generation.current === token) {
        stop();
        setError(
          e instanceof Error && e.message.includes("HTTPS")
            ? e.message
            : "Accès à la caméra impossible. Autorisez-la dans le navigateur puis réessayez.",
        );
      }
    }
  }
  return (
    <section className="mx-auto max-w-xl rounded-2xl border bg-card p-5 sm:p-8">
      <div className="relative mb-6 aspect-square overflow-hidden rounded-2xl bg-slate-950">
        <video
          ref={video}
          autoPlay
          muted
          playsInline
          className="h-full w-full object-cover"
          aria-label="Aperçu de la caméra"
        />
        {!running && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 text-slate-200">
            <ScanLine size={64} strokeWidth={1} />
            <p className="text-sm">Placez le QR dans le cadre</p>
          </div>
        )}
      </div>
      <p className="mb-5 text-sm text-muted-foreground">
        Scannez une étiquette Harnois pour ouvrir la fiche. Seuls les QR de ce
        site sont acceptés.
      </p>
      <div className="flex flex-wrap gap-3">
        <Button onClick={() => void start()} disabled={running}>
          <Camera size={16} />
          Activer la caméra
        </Button>
        {running && (
          <Button variant="outline" onClick={stop}>
            Arrêter
          </Button>
        )}
      </div>
      {error && (
        <p
          role="alert"
          className="mt-4 rounded-lg bg-danger/10 p-3 text-sm text-danger"
        >
          {error}
        </p>
      )}
    </section>
  );
}
