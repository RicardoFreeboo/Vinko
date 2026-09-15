import type { Metadata } from "next";
import { LegalDoc } from "@/components/LegalDoc";
import { t } from "@/lib/i18n";

export const metadata: Metadata = { title: t("legal.privacy.title") };

// Política de privacidad (requisito de AdSense + RGPD). Accesible por URL y
// enlazada desde /p y /login para que el revisor de AdSense la encuentre.
export default function Privacidad() {
  return (
    <LegalDoc
      titleKey="legal.privacy.title"
      sectionKeys={[
        "legal.privacy.s1", "legal.privacy.s2", "legal.privacy.s3", "legal.privacy.s4",
        "legal.privacy.s5", "legal.privacy.s6", "legal.privacy.s7", "legal.privacy.s8",
      ]}
    />
  );
}
