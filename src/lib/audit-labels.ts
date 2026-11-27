import type { AuditAction } from "@/server/services/audit";
import { roleLabels } from "./auth-messages";

export const auditActionLabels: Record<AuditAction, string> = {
  EQUIPMENT_EXPORTED: "Équipements exportés",
  EQUIPMENT_DOCUMENT_GENERATED: "Attestation générée",
  EQUIPMENT_LABELS_GENERATED: "Étiquettes générées",
  ASSIGNMENT_LOST: "Perte de matériel déclarée",
  LOAN_DATE_CHANGED: "Échéance du prêt modifiée",
  EQUIPMENT_IMPORTED: "Équipements importés",
  CATEGORY_CREATED: "Catégorie créée",
  CATEGORY_UPDATED: "Catégorie modifiée",
  CATEGORY_DELETED: "Catégorie inutilisée supprimée",
  SUPPLIER_CREATED: "Fournisseur créé",
  SUPPLIER_UPDATED: "Fournisseur modifié",
  SUPPLIER_DELETED: "Fournisseur inutilisé supprimé",
  REFERENCE_CREATED: "Référentiel créé",
  REFERENCE_UPDATED: "Référentiel modifié",
  REFERENCE_DELETED: "Référentiel inutilisé supprimé",
  EMPLOYEE_CREATED: "Employé créé",
  EMPLOYEE_UPDATED: "Employé modifié",
  EMPLOYEE_STATUS_CHANGED: "Statut de l’employé modifié",
  EMPLOYEE_IMMEDIATE_DEPARTURE: "Départ immédiat",
  EMPLOYEES_IMPORTED: "Employés importés",
  EMPLOYEES_EXPORTED: "Employés exportés",
  LOGIN_SUCCEEDED: "Connexion réussie",
  LOGIN_FAILED: "Échec de connexion",
  INVITATION_CREATED: "Invitation créée",
  INVITATION_REVOKED: "Invitation révoquée",
  INVITATION_ACCEPTED: "Invitation acceptée",
  PROVIDER_LINKED: "Méthode de connexion liée",
  PROVIDER_UNLINKED: "Méthode de connexion déliée",
  PASSWORD_RESET: "Mot de passe réinitialisé",
  PASSWORD_CHANGED: "Mot de passe modifié",
  MFA_ENROLLMENT_STARTED: "Configuration de la 2FA commencée",
  MFA_FACTOR_CONFIRMED: "Facteur de sécurité confirmé",
  MFA_FACTOR_REMOVED: "Facteur de sécurité supprimé",
  MFA_VERIFIED: "Double authentification vérifiée",
  MFA_VERIFICATION_FAILED: "Échec de double authentification",
  MFA_BLOCKED: "Double authentification bloquée",
  MFA_RECOVERY_USED: "Code de secours utilisé",
  MFA_RECOVERY_REGENERATED: "Codes de secours renouvelés",
  MFA_RESET_ADMIN: "2FA réinitialisée par un administrateur",
  MFA_RESET_CLI: "2FA réinitialisée par la commande de secours",
  MFA_NOTIFICATION_FAILED: "Échec de notification de sécurité",
  PRIMARY_REVERIFIED: "Connexion principale revérifiée",
  USER_ROLE_CHANGED: "Rôle modifié",
  USER_STATUS_CHANGED: "Statut du compte modifié",
  USER_EMPLOYEE_CHANGED: "Lien avec l’employé modifié",
  USER_SESSIONS_REVOKED: "Sessions révoquées par un administrateur",
  SESSIONS_REVOKED: "Sessions personnelles révoquées",
  AUDIT_EXPORTED: "Journal exporté",
  EQUIPMENT_CREATED: "Équipement créé",
  EQUIPMENT_UPDATED: "Équipement modifié",
  EQUIPMENT_ARCHIVED: "Équipement archivé",
  ASSIGNMENT_CREATED: "Assignation créée",
  ASSIGNMENT_RETURNED: "Matériel restitué",
};
export const auditEntityLabels: Record<string, string> = {
  Category: "Catégorie",
  Supplier: "Fournisseur",
  Employee: "Employé",
  Organization: "Organisation",
  Department: "Pôle",
  Location: "Site",
  User: "Utilisateur",
  Invitation: "Invitation",
  Account: "Compte de connexion",
  Authentication: "Authentification",
  Mfa: "Double authentification",
  AuditLog: "Journal d’audit",
  Equipment: "Équipement",
  Assignment: "Assignation",
};
export function auditActionLabel(action: string) {
  return Object.hasOwn(auditActionLabels, action)
    ? auditActionLabels[action as AuditAction]
    : action;
}
export function auditEntityLabel(entity: string) {
  return Object.hasOwn(auditEntityLabels, entity)
    ? auditEntityLabels[entity]
    : entity;
}
const valueLabels: Record<string, Record<string, string>> = {
  role: roleLabels,
  scope: { one: "Une session", others: "Toutes les autres sessions" },
  order: { asc: "Croissant", desc: "Décroissant" },
  sort: { createdAt: "Date", action: "Action", entityType: "Type d’entité" },
  method: {
    TOTP: "Application d’authentification",
    WEBAUTHN: "Clé de sécurité",
    RECOVERY_CODE: "Code de secours",
    PASSWORD: "Mot de passe",
  },
  providerId: {
    google: "Google",
    microsoft: "Microsoft",
    credential: "Mot de passe",
  },
  reason: {
    INVALID_PROOF: "Preuve invalide",
    COUNTER_REGRESSION: "Compteur de sécurité en régression",
    CHALLENGE_INVALID: "Demande de vérification invalide",
  },
};
export function auditValueLabel(field: string, value: string) {
  if (field === "action") return auditActionLabel(value);
  if (field === "entityType") return auditEntityLabel(value);
  const labels = Object.hasOwn(valueLabels, field)
    ? valueLabels[field]
    : undefined;
  return labels && Object.hasOwn(labels, value) ? labels[value] : value;
}
