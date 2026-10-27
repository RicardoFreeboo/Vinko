-- 0070_market_noun_prediccion — la palabra visible pasa a «predicción»
-- Decisión de producto: el sustantivo que ve el jugador debe entenderse en TODA
-- Latinoamérica y ser neutro, sin connotación de azar. Se gestiona POR MERCADO
-- con markets.noun (0064): aquí se fija el valor de los mercados sembrados y el
-- default de los nuevos. Las tablas/rutas/RPC internas siguen llamándose 'porra'
-- (identificadores de código, no texto visible).
alter table public.markets alter column noun set default 'predicción';
update public.markets set noun = 'predicción' where code in ('GLOBAL', 'CO', 'ES');
notify pgrst, 'reload schema';
