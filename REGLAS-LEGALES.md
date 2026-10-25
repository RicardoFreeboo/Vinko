# Reglas legales de Vinko — modo SOLO-PUNTOS (fuente canónica)

> **Este documento manda.** Es la fuente de verdad legal del producto para el lanzamiento y el rebuild bajo la C-Corp. Si una línea de código, copy o migración contradice esto, gana este documento. Última revisión: 25-oct-2026.
>
> Basado en el análisis legal por país (**UK, BR, MX, CO, AR, PE, CL, ES, US**).

## Tesis legal (por qué existen estas reglas)

Vinko es **legal sin licencia SOLO si es un juego social sin contraprestación ni premio con valor económico.** En cuanto se rompe una de las condiciones de abajo, Vinko deja de ser un juego social y pasa a ser **una** de estas dos cosas, ninguna aceptable para el lanzamiento:

- **Juego regulado** → licencia en cada país (UKGC en UK, etc.).
- **Promoción con premio** → autorización previa (ej.: **Coljuegos** en CO, **SPA** en BR, **ONAGI** en PE).

## INVARIANTES (el código NUNCA puede violarlos)

1. **Los Vinkos son gratis y sin valor económico.** Se obtienen solo por vías internas y gratuitas (regalo diario, goteo, acertar porras, ver anuncios recompensados). **Nunca se compran con dinero.**
2. **Los Vinkos no se compran, no se canjean por dinero/bienes y no se transfieren entre usuarios.** La **única** excepción es el reparto del bote de una porra entre los acertantes (parimutuel, en Vinkos). No hay RPC de regalo, trueque, compra ni retirada.
3. **Sin premios reales ni con valor económico.** Nada de dinero, ni "cosas" (una cena, una entrada, un regalo). Vinko **no registra, no arbitra y no recuerda** ningún premio externo. El único "premio" es Puntería (ranking de habilidad) y Vinkos.
4. **Sin dinero en ninguna forma:** nada de cartera/wallet, euros, escrow, comisión por porra, pools de dinero, KYC, retiradas, proveedor de custodia, ni liquidación P2P (enlaces Bizum/PayPal). Custodiar dinero o cobrar comisión = operar apuestas. Facilitar apuestas entre usuarios = *betting intermediary* (UK Gambling Act s.13).
5. **Sin afiliación a casas de apuestas** ni publicidad/enlaces/tracking/revenue-share de operadores de juego. (Mostrar un anuncio de juego a un menor registrado infringe la norma — ASA, caso Hollywoodbets 2025. En CL no existe operador legal al que afiliar.)
6. **Solo mayores de 18.** (Pendiente de aplicar en el código la subida del gate de registro de 14 → 18; ver el plan de tareas.)
7. **El agente de tendencias nunca ingiere cuotas/odds** (veto en la capa de ingesta + en la salida del modelo + triggers de BD). Esto se mantiene.

## Léxico prohibido en toda la copy pública (ES / EN / PT)

`apuesta` · `apostar` · `bet` · `betting` · `wager` · `aposta` · `cuota` · `odds` · `casa de apuestas` · `bookmaker` · `bote` (como pozo de dinero) · `jackpot` · `casino` · `cartera`/`wallet` · `dinero`/`money`/`€`/`$` · `cobrar` · `retirar` · `ganar dinero`.
Vocabulario permitido: **porra, pronóstico, predicción, puntos, Vinkos, Puntería, Nivel**.
Revisar también: metadatos, OG tags, emails, push, onboarding y landing. El check `scripts/lexicon-check.mjs` lo verifica en los JSON de mensajes y migraciones ≥0030; **no** cubre `.tsx`/OG/push automáticamente, así que eso se revisa a mano.

## LO PERMITIDO (superficie segura del producto)

- El loop social: crear porra → compartir → pick con Vinkos → resolver → ranking.
- **Parimutuel del bote en Vinkos** (reparto proporcional entre acertantes, con floor y devolución si nadie acierta).
- **Puntería** (ranking de habilidad ponderado por dificultad) — nunca comprable.
- Gamificación: ligas, temporada, grupos, rachas, tienda de potenciadores (sumideros de Vinkos).
- Anuncios **display** (AdSense) fuera de `/p/[slug]` y del flujo de pronóstico, y **recompensados** que dan **solo Vinkos/Nivel, nunca dinero ni Puntería**.
- El Reto = porra 1v1 que se juega **solo con Vinkos y Puntería** (sin premio externo).

## Consecuencia de romper un invariante

Cualquier incumplimiento recalifica a Vinko como juego regulado o promoción con premio en al menos uno de los 9 países analizados. Por eso estas reglas son **bloqueantes de merge**, no recomendaciones.

## Checklist antes de cada merge a main

- [ ] ¿Alguna tabla/columna ligada a usuario guarda saldo, importe, moneda, IBAN, tarjeta o handle de pago? → **no mergear**.
- [ ] ¿Alguna RPC mueve dinero, cobra comisión o permite comprar/transferir Vinkos (fuera del bote)? → **no mergear**.
- [ ] ¿Hay copy/enlaces de dinero, afiliación o premios con valor? → **no mergear**.
- [ ] ¿`scripts/schema-invariant.mjs` y `scripts/lexicon-check.mjs` pasan? (deben estar en CI).
- [ ] ¿El gate de edad es 18+?

## La "capa 2" (dinero con licencia) no se pierde

Todo el subsistema de dinero (wallet, pools, KYC, retiradas, P2P, afiliación, Club, revshare) está **archivado** en la rama **`archive/capa2-dinero`**. No se borra: se retoma el día que haya licencia/autorización por país. Para reintroducir cualquier pieza hay que pasar antes por un abogado de juego del país correspondiente.
