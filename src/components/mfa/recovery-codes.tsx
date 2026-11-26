"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { FormMessage } from "@/components/auth/form-message";
export function RecoveryCodes({
  codes,
  onDone,
}: {
  codes: string[];
  onDone: () => void;
}) {
  const [message, setMessage] = useState("");
  const [saved, setSaved] = useState(false);
  function download() {
    const url = URL.createObjectURL(
      new Blob(
        [
          `Codes de secours Harnois\nChaque code est utilisable une seule fois. Gardez ce fichier dans un lieu sûr.\n\n${codes.join("\n")}\n`,
        ],
        { type: "text/plain;charset=utf-8" },
      ),
    );
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "harnois-codes-de-secours.txt";
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return (
    <section className="space-y-5" aria-labelledby="recovery-heading">
      <h2 id="recovery-heading" className="text-xl font-semibold">
        Conservez vos codes de secours
      </h2>
      <p className="text-sm leading-6 text-muted-foreground">
        Ils ne seront affichés qu’une fois. Chaque code remplace un second
        facteur pour une connexion. Enregistrez-les dans un endroit sûr, séparé
        de votre appareil.
      </p>
      <ul className="grid gap-2 rounded-xl border bg-card p-4 sm:grid-cols-2">
        {codes.map((code) => (
          <li className="font-mono text-sm" key={code}>
            {code}
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap gap-3">
        <Button
          variant="outline"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(codes.join("\n"));
              setMessage("Codes copiés.");
            } catch {
              setMessage(
                "La copie n’est pas disponible. Téléchargez le fichier ou copiez les codes manuellement.",
              );
            }
          }}
        >
          Copier
        </Button>
        <Button variant="outline" onClick={download}>
          Télécharger
        </Button>
      </div>
      <FormMessage success>{message}</FormMessage>
      <label className="flex min-h-11 items-start gap-3 text-sm">
        <input
          className="mt-1 size-4"
          type="checkbox"
          checked={saved}
          onChange={(event) => setSaved(event.target.checked)}
        />
        J’ai conservé mes codes de secours.
      </label>
      <Button className="w-full" disabled={!saved} onClick={onDone}>
        Continuer
      </Button>
    </section>
  );
}
