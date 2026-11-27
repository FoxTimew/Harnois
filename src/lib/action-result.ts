import { ServiceError } from "@/server/services/errors";
export type ActionResult = { error?: string; success?: string };
export function actionError(error: unknown): ActionResult {
  return {
    error: error instanceof ServiceError ? error.code : "INVALID_REQUEST",
  };
}
export function actionMessage(code: string) {
  const messages: Record<string, string> = {
    FORBIDDEN: "Vous n’avez pas les droits nécessaires.",
    UNAUTHENTICATED: "Votre session a expiré. Reconnectez-vous.",
    REAUTHENTICATION_REQUIRED:
      "Confirmez à nouveau votre identité avant de continuer.",
    SELF_CHANGE_FORBIDDEN:
      "Cette action sur votre propre compte n’est pas autorisée.",
    LAST_ACTIVE_ADMIN: "Il doit rester au moins un administrateur actif.",
    EMPLOYEE_ALREADY_LINKED: "Cet employé est déjà lié à un compte.",
    EMPLOYEE_NOT_FOUND: "Cet employé n’existe pas.",
    NOT_FOUND: "Cet élément n’est plus disponible.",
    EXPORT_TOO_LARGE:
      "La sélection dépasse 10 000 lignes. Affinez les filtres avant de l’exporter.",
  };
  return (
    messages[code] ??
    "L’action n’a pas abouti. Vérifiez les informations et réessayez."
  );
}
