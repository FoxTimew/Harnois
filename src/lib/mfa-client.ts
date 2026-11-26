import type { MfaService } from "@/server/services/mfa";
export type MfaStatus = Awaited<ReturnType<MfaService["status"]>>;
export class MfaClientError extends Error {
  constructor(
    public code: string,
    public retryAfter?: number,
  ) {
    super(code);
  }
}
export async function mfaRequest<T>(path: string, body?: unknown): Promise<T> {
  const response = await fetch(`/api/mfa/${path}`, {
    method: body === undefined ? "GET" : "POST",
    cache: "no-store",
    ...(body === undefined
      ? {}
      : {
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }),
  });
  const data = await response.json();
  if (!response.ok) throw new MfaClientError(data.code, data.retryAfter);
  return data as T;
}
export function mfaMessage(error: unknown) {
  if (error instanceof MfaClientError) {
    if (error.code === "MFA_RATE_LIMITED")
      return `Trop de tentatives. Réessayez dans ${Math.max(1, Math.ceil((error.retryAfter ?? 900) / 60))} minute(s).`;
    const messages: Record<string, string> = {
      MFA_INVALID_PROOF:
        "Vérification refusée. Vérifiez le code ou recommencez avec votre clé. Un code déjà utilisé ne peut pas être réutilisé.",
      REAUTHENTICATION_REQUIRED:
        "Confirmez à nouveau votre identité avant de continuer.",
      LAST_MFA_FACTOR:
        "Ajoutez un autre facteur avant de supprimer celui-ci : votre compte doit rester protégé.",
      MFA_SELF_RESET_FORBIDDEN:
        "Vous ne pouvez pas réinitialiser votre propre double authentification ici.",
      MFA_SETUP_REQUIRED: "Configurez d’abord votre double authentification.",
      MFA_REQUIRED: "Validez d’abord votre double authentification.",
      UNAUTHENTICATED: "Votre session a expiré. Reconnectez-vous.",
      USER_NOT_FOUND: "Aucun utilisateur ne correspond à cette adresse.",
      FORBIDDEN: "Vous n’avez pas les droits nécessaires.",
      INVALID_REQUEST: "Vérifiez les champs du formulaire.",
      TOTP_ALREADY_CONFIGURED:
        "Une application d’authentification est déjà configurée.",
    };
    if (messages[error.code]) return messages[error.code];
  }
  if (
    error instanceof Error &&
    (error.name === "NotAllowedError" ||
      error.name === "AbortError" ||
      error.name === "WebAuthnError")
  )
    return "L’opération avec la clé a été annulée ou n’a pas abouti. Vous pouvez réessayer ou choisir une autre méthode.";
  return "L’opération n’a pas abouti. Réessayez dans quelques instants.";
}
