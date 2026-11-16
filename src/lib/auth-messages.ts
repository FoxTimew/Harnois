export function authErrorMessage(code?: string) {
  switch (code) {
    case "INVITATION_EMAIL_MISMATCH":
    case "invitation_email_mismatch":
      return "Ce compte ne correspond pas à l’adresse invitée. Revenez au lien d’invitation et choisissez un autre compte.";
    case "INVITATION_INVALID":
      return "Cette invitation n’est plus utilisable. Demandez une nouvelle invitation à votre administrateur.";
    case "EMAIL_NOT_VERIFIED":
      return "Confirmez votre adresse email avant de vous connecter.";
    case "EMAIL_TRANSPORT_UNAVAILABLE":
    case "EMAIL_DELIVERY_FAILED":
      return "L’envoi d’emails est temporairement indisponible. Contactez votre administrateur.";
    case "TOO_MANY_REQUESTS":
    case "RATE_LIMITED":
      return "Trop de tentatives. Réessayez dans quelques minutes.";
    case "LAST_SIGN_IN_METHOD":
    case "FAILED_TO_UNLINK_LAST_ACCOUNT":
      return "Conservez au moins une méthode de connexion.";
    case "REAUTHENTICATION_REQUIRED":
    case "SESSION_NOT_FRESH":
      return "Reconnectez-vous pour modifier vos méthodes de connexion.";
    case "INVALID_TOKEN":
      return "Ce lien a expiré ou a déjà été utilisé. Demandez un nouveau lien.";
    case "USER_ALREADY_EXISTS":
      return "Un utilisateur possède déjà cette adresse.";
    case "EMPLOYEE_ALREADY_LINKED":
      return "Cet employé est déjà lié à un utilisateur.";
    case "FORBIDDEN":
      return "Vous n’avez pas les droits nécessaires.";
    default:
      return "La connexion n’a pas abouti. Vérifiez vos informations ou contactez votre administrateur.";
  }
}
export const roleLabels = {
  ADMIN: "Administrateur",
  IT_MANAGER: "Responsable informatique",
  TECHNICIAN: "Technicien",
  EMPLOYEE: "Employé",
} as const;
