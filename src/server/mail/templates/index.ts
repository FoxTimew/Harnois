export type EmailTemplate = "invitation" | "verification" | "password-reset";
export type SecurityNotice = {
  event: "factor-added" | "factor-removed" | "recovery-used" | "mfa-reset";
  at: string;
  ip: string;
};

export function renderSecurityEmail(notice: SecurityNotice, url: string) {
  const event = {
    "factor-added":
      "Un facteur de double authentification a été ajouté à votre compte.",
    "factor-removed":
      "Un facteur de double authentification a été supprimé de votre compte.",
    "recovery-used":
      "Un code de secours a été utilisé pour accéder à votre compte.",
    "mfa-reset":
      "Votre double authentification a été réinitialisée. Toutes vos sessions ont été révoquées.",
  }[notice.event];
  const details = `${event}\nDate : ${notice.at}\nAdresse IP : ${notice.ip}\nSi vous n’êtes pas à l’origine de cette opération, contactez immédiatement votre administrateur et changez votre mot de passe.\nSécurité de votre compte : ${url}`;
  return {
    subject: "Activité de sécurité sur votre compte Harnois",
    text: `Harnois\n\n${details}`,
    html: `<!doctype html><html lang="fr"><body style="font-family:Arial,sans-serif;color:#253125;padding:24px"><h1>Activité de sécurité</h1><p>${escapeHtml(event)}</p><p>Date : ${escapeHtml(notice.at)}<br>Adresse IP : ${escapeHtml(notice.ip)}</p><p>Si vous n’êtes pas à l’origine de cette opération, contactez immédiatement votre administrateur et changez votre mot de passe.</p><a href="${escapeHtml(url)}">Sécurité de votre compte Harnois</a></body></html>`,
  };
}

const copy = {
  invitation: {
    subject: "Votre invitation à Harnois",
    heading: "Bienvenue dans votre espace Harnois",
    text: "Vous avez été invité à rejoindre Harnois. Choisissez votre méthode de connexion pour activer votre accès.",
    button: "Accepter l’invitation",
    expiry: "Ce lien est valable 7 jours.",
  },
  verification: {
    subject: "Confirmez votre adresse email",
    heading: "Confirmez votre adresse",
    text: "Confirmez cette adresse email pour accéder à votre espace Harnois.",
    button: "Vérifier mon adresse",
    expiry: "Ce lien est valable 1 heure.",
  },
  "password-reset": {
    subject: "Réinitialisez votre mot de passe Harnois",
    heading: "Un nouveau mot de passe",
    text: "Vous avez demandé à réinitialiser votre mot de passe Harnois.",
    button: "Choisir un mot de passe",
    expiry: "Ce lien est valable 1 heure et ne peut être utilisé qu’une fois.",
  },
};
function escapeHtml(value: string) {
  return value.replace(
    /[&<>"']/g,
    (char) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        char
      ]!,
  );
}
export function renderEmail(template: EmailTemplate, url: string) {
  const content = copy[template];
  return {
    subject: content.subject,
    text: `${content.heading}\n\n${content.text}\n\n${content.button} : ${url}\n\n${content.expiry}\nSi vous n’êtes pas à l’origine de cette demande, ignorez ce message.\n\nHarnois`,
    html: `<!doctype html><html lang="fr"><body style="font-family:Arial,sans-serif;background:#f8f8f3;color:#253125;padding:32px"><main style="max-width:560px;margin:auto;background:white;padding:32px;border:1px solid #dce0d4;border-radius:16px"><p style="font-weight:bold">harnois.</p><h1 style="font-size:24px">${content.heading}</h1><p>${content.text}</p><p style="margin:32px 0"><a href="${escapeHtml(url)}" style="background:#30432d;color:white;padding:14px 20px;border-radius:8px;text-decoration:none">${content.button}</a></p><p>${content.expiry}</p><p style="color:#60675d;font-size:13px">Si vous n’êtes pas à l’origine de cette demande, ignorez ce message.</p></main></body></html>`,
  };
}
