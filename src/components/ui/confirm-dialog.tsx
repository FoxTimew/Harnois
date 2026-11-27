"use client";
import * as AlertDialog from "@radix-ui/react-alert-dialog";
import { Button } from "./button";
export function ConfirmDialog({
  title,
  description,
  trigger,
  onConfirm,
  pending = false,
}: {
  title: string;
  description: string;
  trigger: React.ReactNode;
  onConfirm: () => void;
  pending?: boolean;
}) {
  return (
    <AlertDialog.Root>
      <AlertDialog.Trigger asChild>{trigger}</AlertDialog.Trigger>
      <AlertDialog.Portal>
        <AlertDialog.Overlay className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm" />
        <AlertDialog.Content className="fixed top-1/2 left-1/2 z-50 w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-2xl border bg-card p-6 shadow-xl">
          <AlertDialog.Title className="text-xl font-semibold">
            {title}
          </AlertDialog.Title>
          <AlertDialog.Description className="mt-3 text-sm leading-6 text-muted-foreground">
            {description}
          </AlertDialog.Description>
          <div className="mt-6 flex flex-wrap justify-end gap-2">
            <AlertDialog.Cancel asChild>
              <Button variant="outline">Annuler</Button>
            </AlertDialog.Cancel>
            <AlertDialog.Action asChild>
              <Button disabled={pending} onClick={onConfirm}>
                Confirmer
              </Button>
            </AlertDialog.Action>
          </div>
        </AlertDialog.Content>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}
