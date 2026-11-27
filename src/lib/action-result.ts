import { ServiceError } from "@/server/services/errors";
export type ActionResult = {
  error?: string;
  success?: string;
  details?: Record<string, number>;
};
export function actionError(error: unknown): ActionResult {
  return {
    error: error instanceof ServiceError ? error.code : "INVALID_REQUEST",
    ...(error instanceof ServiceError && error.details
      ? { details: error.details }
      : {}),
  };
}
export function actionMessage(code: string, details?: Record<string, number>) {
  if (code === "REFERENCE_IN_USE" || code === "DEPARTMENT_HAS_EMPLOYEES") {
    const labels: Record<string, string> = {
      children: "sous-catégorie(s)",
      software: "logiciel(s)",
      invoices: "facture(s)",
      departments: "pôle(s)",
      employees: "employé(s)",
      subscriptions: "abonnement(s)",
      equipment: "équipement(s)",
    };
    return (
      "Opération refusée : " +
      Object.entries(details ?? {})
        .filter(([, count]) => count > 0)
        .map(([key, count]) => `${count} ${labels[key] ?? key}`)
        .join(", ") +
      " encore rattaché(s), y compris les historiques."
    );
  }
  const messages: Record<string, string> = {
    NOTES_TOO_LONG:
      "Les notes et le motif dépassent 2 000 caractères. Raccourcissez le texte avant de valider.",
    CATEGORY_CYCLE: "Ce parent formerait une boucle de catégories.",
    DUPLICATE_SPEC_KEY:
      "Cette clé de caractéristique existe déjà dans la catégorie ou un parent.",
    IMMUTABLE_SPEC_TYPE:
      "Le type d’une caractéristique ne peut pas être modifié.",
    SPEC_IN_USE:
      "Cette caractéristique est utilisée. Conservez-la ou désactivez-la.",
    INVALID_SPECS:
      "Vérifiez les caractéristiques et leurs types pour cette catégorie.",
    DUPLICATE_EQUIPMENT: "Ce numéro d’inventaire ou de série est déjà utilisé.",
    EQUIPMENT_ASSIGNED: "Cet équipement a déjà une assignation active.",
    ASSIGNMENT_REQUIRED:
      "Attribuez cet équipement depuis sa fiche pour créer l’assignation.",
    ASSIGNMENT_CLOSED:
      "Cette assignation est déjà close ou ne correspond pas à un prêt.",
    RETURN_REQUIRED: "Effectuez d’abord le retour du matériel.",
    RETURN_CONDITION_REQUIRED: "Renseignez l’état du matériel au retour.",
    REASON_REQUIRED: "Une note explicative est obligatoire.",
    DAMAGED_EQUIPMENT: "Un équipement endommagé doit passer en réparation.",
    EMPLOYEE_UNAVAILABLE:
      "Cet employé n’existe pas ou a quitté l’organisation.",
    LOAN_DATE_REQUIRED: "Le prêt exige une date de retour prévue non passée.",
    ORGANIZATION_REQUIRED:
      "Rattachez l’employé à une organisation avant de générer l’attestation.",
    ONE_EMPLOYEE_REQUIRED: "Sélectionnez les mouvements d’un seul employé.",
    INVALID_CATEGORY_PATH: "Vérifiez le chemin de catégorie : Parent > Enfant.",
    STALE_RECORD: "Cette fiche a changé. Rechargez-la avant de réessayer.",
    DUPLICATE_REFERENCE: "Un élément de ce nom existe déjà dans ce périmètre.",
    DUPLICATE_EMPLOYEE_EMAIL:
      "Cette adresse email appartient déjà à un employé.",
    ORGANIZATION_MISMATCH: "L’organisation doit correspondre à celle du pôle.",
    REFERENCE_NOT_FOUND: "Un référentiel sélectionné n’existe plus.",
    HIERARCHY_CYCLE: "Ce manager formerait une boucle dans la hiérarchie.",
    MANAGER_NOT_FOUND: "Le manager sélectionné n’existe plus.",
    MANAGER_LEFT: "Un employé parti ne peut pas être choisi comme manager.",
    MANAGER_HAS_REPORTS:
      "Réaffectez les collaborateurs non partis avant le départ de leur manager.",
    INVALID_EMPLOYEE_DATES:
      "La date de départ ne peut pas précéder la date d’arrivée.",
    DEPARTURE_DATE_REQUIRED:
      "Un départ exige une date renseignée et non future.",
    INVALID_STATUS_TRANSITION: "Ce changement de statut n’est pas autorisé.",
    IMMEDIATE_DEPARTURE_CONFIRMATION_REQUIRED:
      "Confirmez le départ immédiat, sans phase de préparation.",
    CANCEL_DEPARTURE_DATE:
      "Effacez explicitement la date de départ pour annuler la préparation.",
    PREVIEW_EXPIRED:
      "L’aperçu a expiré ou a déjà été utilisé. Générez un nouvel aperçu.",
    PREVIEW_CHANGED:
      "Le fichier, ses options ou les données ont changé. Générez un nouvel aperçu.",
    IMPORT_HAS_ERRORS:
      "Corrigez toutes les erreurs avant de confirmer l’import.",
    REFERENCES_NOT_APPROVED:
      "Confirmez explicitement la création de tous les référentiels proposés.",
    IMPORT_TOO_LARGE:
      "Limite dépassée : 2 Mio par fichier, 1 000 lignes de données.",
    INVALID_CSV:
      "Le fichier CSV est invalide. Vérifiez ses colonnes et son encodage.",
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
