-- ============================================================================
-- MON-01 + MON-02 — flags de servidor para apagar el dinero y el Club.
--  · remote_config.money_ui {enabled:false}: toda la UI de dinero (pestaña €,
--    selectores Puntos/Dinero, opción Dinero en /nueva, /verificar,
--    /juego-seguro, /demo/*, /showcase, landing con dinero) desaparece.
--    El código asume false si la fila no existe (fail-closed).
--  · remote_config.club.enabled=false hasta que las ventajas existan de verdad.
-- Idempotente.
-- ============================================================================
insert into public.remote_config (key, value) values ('money_ui', '{"enabled": false}'::jsonb)
  on conflict (key) do nothing;

insert into public.remote_config (key, value) values ('club', '{"enabled": false}'::jsonb)
  on conflict (key) do update
    set value = coalesce(public.remote_config.value, '{}'::jsonb) || '{"enabled": false}'::jsonb;

notify pgrst, 'reload schema';
