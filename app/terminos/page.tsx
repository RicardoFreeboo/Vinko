import type { Metadata } from "next";
import { LegalDoc } from "@/components/LegalDoc";
import { t } from "@/lib/i18n";

export const metadata: Metadata = { title: t("legal.terms.title") };

// Términos y condiciones (borrador pendiente de abogado). Accesible por URL.
export default function Terminos() {
  return (
    <LegalDoc
      titleKey="legal.terms.title"
      sectionKeys={[
        "legal.terms.s1", "legal.terms.s2", "legal.terms.s3",
        "legal.terms.s4", "legal.terms.s5", "legal.terms.s6",
      ]}
    />
  );
}
