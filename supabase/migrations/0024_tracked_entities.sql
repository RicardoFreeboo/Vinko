-- ============================================================================
-- VINKO — 0024: CATÁLOGO SEMILLA del agente de tendencias (tracked_entities).
-- Son las entidades que vigila el agente para generar porras virales del
-- público objetivo. NO son porras: alimentan la búsqueda de noticias
-- (Google News RSS por palabra clave), y cada señal debe volverse una porra
-- RESOLUBLE o se descarta.
--
-- Editable desde /admin sin desplegar (RLS: lectura admin, escritura admin).
-- Baja lógica con activo=false (se guarda el histórico, no se borra).
--
-- AVISO IMPORTANTE (regla de oro): el canal de YouTube de Zona Gemelos publica
-- contenido de casino/slots. JAMÁS se vigila ese canal por RSS. Para su reality
-- se usa la palabra clave "Cárcel de los Gemelos" vía noticias, nunca su canal.
-- ============================================================================
create table if not exists public.tracked_entities (
  id uuid primary key default gen_random_uuid(),
  nombre          text not null,
  categoria       text not null,
  palabras_clave  text[] not null default '{}',
  handles         text[] not null default '{}',
  pais            text not null default 'ES',
  activo          boolean not null default false,
  last_swept_at   timestamptz,
  created_at      timestamptz not null default now(),
  unique (nombre)
);
create index if not exists tracked_entities_sweep_idx
  on public.tracked_entities (activo, last_swept_at nulls first);

alter table public.tracked_entities enable row level security;
create policy te_read_admin on public.tracked_entities for select
  using (exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'admin'));
create policy te_write_admin on public.tracked_entities for all
  using (exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'admin'))
  with check (exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'admin'));

-- ---------- semillas ----------
-- activo=true = las más fuertes de cada categoría (MVP). El resto queda cargado
-- y se activa desde el panel sin tocar código.
insert into public.tracked_entities (nombre, categoria, palabras_clave, activo) values
  -- realities de televisión (desenlace semanal de fábrica)
  ('La Isla de las Tentaciones', 'reality_tv', array['La Isla de las Tentaciones','isla tentaciones hoguera'], true),
  ('Supervivientes',            'reality_tv', array['Supervivientes expulsado','Supervivientes concursante'], true),
  ('GH Dúo',                    'reality_tv', array['GH Dúo nominados','Gran Hermano Dúo'], false),
  ('MasterChef',                'reality_tv', array['MasterChef eliminado','MasterChef Celebrity'], true),
  ('Maestros de la Costura',    'reality_tv', array['Maestros de la Costura eliminado'], false),
  ('Casados a Primera Vista',   'reality_tv', array['Casados a Primera Vista decisión'], false),
  ('Operación Triunfo',         'reality_tv', array['Operación Triunfo gala','OT nominados'], true),
  -- realities y eventos de internet
  ('La Cárcel de los Gemelos',  'reality_internet', array['Cárcel de los Gemelos'], true),
  ('La Velada del Año',         'reality_internet', array['La Velada del Año Ibai combate'], true),
  ('Kings League',              'reality_internet', array['Kings League jornada','Queens League'], true),
  -- streamers y creadores
  ('Ibai Llanos',   'streamer', array['Ibai Llanos'], true),
  ('TheGrefg',      'streamer', array['TheGrefg'], false),
  ('Rubius',        'streamer', array['El Rubius'], false),
  ('Auronplay',     'streamer', array['Auronplay'], false),
  ('IlloJuan',      'streamer', array['IlloJuan'], false),
  ('Westcol',       'streamer', array['Westcol'], false),
  ('Davoo Xeneize', 'streamer', array['Davoo Xeneize'], false),
  ('Spreen',        'streamer', array['Spreen streamer'], false),
  ('Juansguarnizo', 'streamer', array['Juan Guarnizo'], false),
  ('Dalas Review',  'streamer', array['Dalas Review'], false),
  -- fútbol
  ('Mundial 2026',   'futbol', array['Mundial 2026 selección española'], true),
  ('LaLiga',         'futbol', array['LaLiga jornada resultado'], true),
  ('Champions League','futbol', array['Champions League equipos españoles'], true),
  ('Real Madrid',    'futbol', array['Real Madrid partido'], false),
  ('FC Barcelona',   'futbol', array['FC Barcelona partido'], false),
  ('Lamine Yamal',   'futbol', array['Lamine Yamal'], false),
  ('Fichajes',       'futbol', array['fichaje mercado LaLiga'], false),
  -- otros deportes
  ('Fernando Alonso', 'deporte', array['Fernando Alonso carrera'], true),
  ('Carlos Alcaraz',  'deporte', array['Carlos Alcaraz partido'], true),
  ('MotoGP',          'deporte', array['MotoGP carrera'], false),
  ('UFC',             'deporte', array['UFC combate estelar'], false),
  ('NBA',             'deporte', array['NBA playoffs'], false),
  ('Ciclismo',        'deporte', array['Vuelta a España etapa'], false),
  -- música y cultura
  ('Benidorm Fest', 'musica', array['Benidorm Fest candidatura'], false),
  ('Eurovisión',    'musica', array['Eurovisión España'], false),
  ('Premios Goya',  'cultura', array['Premios Goya nominaciones'], false),
  ('Rosalía',       'musica', array['Rosalía disco'], false),
  ('Aitana',        'musica', array['Aitana concierto'], false),
  ('Quevedo',       'musica', array['Quevedo canción'], false),
  -- estacional
  ('Lotería de Navidad', 'estacional', array['Lotería de Navidad el Gordo'], false),
  ('Campanadas',         'estacional', array['Campanadas Nochevieja presentadores'], false),
  ('Canción del verano', 'estacional', array['canción del verano número uno'], false)
on conflict (nombre) do nothing;
