import "server-only";
import path from "node:path";
import PDFDocument from "pdfkit";
import QRCode from "qrcode";
import type { z } from "zod";
import { labelOptionsSchema, equipmentUrl } from "@/lib/equipment-qr";
import { displayCivilDate } from "@/lib/date-only";
import { conditionLabels } from "@/lib/equipment-validation";

const regular = path.join(
  process.cwd(),
  "node_modules/@fontsource/noto-sans/files/noto-sans-latin-400-normal.woff",
);
const bold = path.join(
  process.cwd(),
  "node_modules/@fontsource/noto-sans/files/noto-sans-latin-700-normal.woff",
);
const mm = (v: number) => (v * 72) / 25.4;
function document(options: PDFKit.PDFDocumentOptions) {
  const doc = new PDFDocument({
    ...options,
    font: regular,
    info: { Title: "Harnois", Creator: "Harnois" },
  });
  doc.registerFont("regular", regular);
  doc.registerFont("bold", bold);
  const chunks: Buffer[] = [];
  const done = new Promise<Buffer>((resolve, reject) => {
    doc.on("data", (c: Buffer) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });
  return { doc, done };
}
export type CertificateData = {
  kind: "handover" | "return";
  generatedAt: string;
  organization: string;
  employee: string;
  rows: {
    assetTag: string;
    name: string;
    serialNumber: string | null;
    assignedAt: string;
    returnedAt: string | null;
    conditionOut: keyof typeof conditionLabels | null;
    conditionIn: keyof typeof conditionLabels | null;
    expectedReturnDate: string | null;
    notes: string | null;
  }[];
};
export async function renderCertificate(data: CertificateData) {
  const { doc, done } = document({ size: "A4", margin: 48, bufferPages: true });
  doc
    .fillColor("#0f766e")
    .font("bold")
    .fontSize(12)
    .text("HARNOIS · GESTION DU PARC");
  doc
    .moveDown()
    .fillColor("#142b38")
    .fontSize(24)
    .text(
      data.kind === "handover"
        ? "Attestation de remise"
        : "Attestation de restitution",
    );
  doc
    .moveDown(0.5)
    .font("regular")
    .fontSize(10)
    .fillColor("#475569")
    .text("Document établi à partir des données actuelles.");
  doc
    .moveDown()
    .fillColor("#142b38")
    .font("bold")
    .fontSize(12)
    .text(data.organization);
  doc
    .font("regular")
    .fontSize(11)
    .text("Collaborateur : " + data.employee);
  doc.text(
    "Généré le " +
      new Intl.DateTimeFormat("fr-FR", {
        dateStyle: "long",
        timeStyle: "short",
        timeZone: "Europe/Paris",
      }).format(new Date(data.generatedAt)),
  );
  for (const [index, row] of data.rows.entries()) {
    if (doc.y > 620) doc.addPage();
    doc
      .moveDown(1.3)
      .font("bold")
      .fontSize(12)
      .text(index + 1 + ". " + row.assetTag + " · " + row.name);
    doc
      .font("regular")
      .fontSize(10)
      .fillColor("#334155")
      .text("Numéro de série : " + (row.serialNumber ?? "Non renseigné"));
    doc.text(
      "Remise : " +
        displayCivilDate(row.assignedAt.slice(0, 10)) +
        " · État : " +
        (row.conditionOut
          ? conditionLabels[row.conditionOut]
          : "Non renseigné"),
    );
    if (row.expectedReturnDate)
      doc.text(
        "Prêt · Retour prévu : " + displayCivilDate(row.expectedReturnDate),
      );
    if (data.kind === "return")
      doc.text(
        "Restitution : " +
          displayCivilDate(row.returnedAt?.slice(0, 10) ?? null) +
          " · État : " +
          (row.conditionIn
            ? conditionLabels[row.conditionIn]
            : "Non renseigné"),
      );
    if (row.notes)
      doc.moveDown(0.3).text("Observations : " + row.notes, { lineGap: 2 });
    doc.fillColor("#142b38");
  }
  if (doc.y > 620) doc.addPage();
  doc
    .moveDown(2)
    .font("regular")
    .fontSize(10)
    .text(
      data.kind === "handover"
        ? "Je reconnais avoir reçu les équipements listés ci-dessus."
        : "Les équipements listés ci-dessus ont été restitués.",
    );
  doc
    .moveDown()
    .text("Date et lieu : __________________________________________________");
  const y = doc.y + 28;
  doc.text("Signature du collaborateur", 48, y, { width: 230 });
  doc.text("Signature du représentant de l’organisation", 310, y, {
    width: 237,
  });
  const pages = doc.bufferedPageRange();
  for (let i = pages.start; i < pages.start + pages.count; i++) {
    doc.switchToPage(i);
    doc
      .font("regular")
      .fontSize(8)
      .fillColor("#64748b")
      .text("Harnois · " + (i + 1) + " / " + pages.count, 48, 800, {
        lineBreak: false,
      });
  }
  doc.end();
  return done;
}
export type LabelData = { id: string; assetTag: string; name: string };
export async function renderLabels(
  rows: LabelData[],
  origin: string,
  options: z.infer<typeof labelOptionsSchema>,
) {
  const single = options.format === "single";
  const { doc, done } = document({ autoFirstPage: false, margin: 0 });
  for (let i = 0; i < rows.length; i++) {
    const position = single ? 0 : options.startPosition - 1 + i,
      slot = position % 21;
    if (i === 0 || slot === 0)
      doc.addPage({ size: single ? [mm(63.5), mm(38.1)] : "A4", margin: 0 });
    const x = single ? 0 : mm(options.marginLeft + (slot % 3) * 66),
      y = single ? 0 : mm(options.marginTop + Math.floor(slot / 3) * 38.1);
    const row = rows[i],
      qr = await QRCode.toBuffer(equipmentUrl(origin, row.id), {
        type: "png",
        errorCorrectionLevel: "M",
        margin: 2,
        width: 300,
      });
    doc.image(qr, x + mm(2), y + mm(3), { width: mm(29), height: mm(29) });
    doc
      .fillColor("#122d36")
      .font("bold")
      .fontSize(7)
      .text("HARNOIS", x + mm(33), y + mm(5), { width: mm(28), height: mm(5) });
    // The bounded label cannot wrap into a neighbouring label.
    doc.fontSize(8).text(row.assetTag, x + mm(33), y + mm(12), {
      width: mm(28),
      height: mm(10),
      ellipsis: true,
    });
    doc
      .font("regular")
      .fontSize(7)
      .text(row.name, x + mm(33), y + mm(23), {
        width: mm(28),
        height: mm(12),
        ellipsis: true,
      });
  }
  doc.end();
  return done;
}
