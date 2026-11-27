"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
export async function downloadFile(
  url: string,
  filename: string,
  body?: unknown,
) {
  const response = await fetch(
    url,
    body
      ? {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }
      : undefined,
  );
  if (!response.ok) {
    const result = await response.json();
    throw new Error(result.error ?? "Téléchargement impossible.");
  }
  const objectUrl = URL.createObjectURL(await response.blob()),
    link = document.createElement("a");
  link.href = objectUrl;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
}
export function DownloadButton({
  url,
  filename,
  body,
  children,
}: {
  url: string;
  filename: string;
  body?: unknown;
  children: React.ReactNode;
}) {
  const [pending, setPending] = useState(false),
    [error, setError] = useState("");
  return (
    <span className="inline-flex max-w-full flex-col gap-2">
      <Button
        type="button"
        variant="outline"
        disabled={pending}
        onClick={async () => {
          setPending(true);
          setError("");
          try {
            await downloadFile(url, filename, body);
          } catch (e) {
            setError(
              e instanceof Error ? e.message : "Téléchargement impossible.",
            );
          } finally {
            setPending(false);
          }
        }}
      >
        {pending ? "Préparation…" : children}
      </Button>
      {error && (
        <span role="alert" className="text-sm text-danger">
          {error}
        </span>
      )}
    </span>
  );
}
