import { requirePageUser } from "@/server/auth/require-page-user";
import { PageHeading } from "@/components/layout/page-heading";
import { ComponentGallery } from "@/components/forms/component-gallery";
export default async function UiPage() {
  await requirePageUser("/admin/ui", {
    permission: { action: "read", resource: { type: "ui" } },
  });
  return (
    <section>
      <PageHeading
        eyebrow="DÉMONSTRATION INTERNE"
        title="Composants"
        description="Les éléments communs de Harnois. Les exemples de cette page ne modifient aucune donnée."
      />
      <ComponentGallery />
    </section>
  );
}
