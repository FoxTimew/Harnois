"use client";
import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { Button } from "./button";
import { useState } from "react";
export function Sheet({
  title,
  description,
  trigger,
  children,
}: {
  title: string;
  description: string;
  trigger: React.ReactNode;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger asChild>{trigger}</Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm" />
        <Dialog.Content
          onClick={(event) => {
            if (
              event.target instanceof Element &&
              event.target.closest("a[href]")
            )
              setOpen(false);
          }}
          className="fixed inset-y-0 right-0 z-50 w-full max-w-md overflow-y-auto border-l bg-card p-6 shadow-xl"
        >
          <Dialog.Title className="pr-12 text-2xl font-semibold">
            {title}
          </Dialog.Title>
          <Dialog.Description className="mt-3 mb-8 text-sm text-muted-foreground">
            {description}
          </Dialog.Description>
          <Dialog.Close asChild>
            <Button
              variant="ghost"
              className="absolute top-3 right-3"
              aria-label="Fermer le panneau"
            >
              <X className="size-5" />
            </Button>
          </Dialog.Close>
          {children}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
