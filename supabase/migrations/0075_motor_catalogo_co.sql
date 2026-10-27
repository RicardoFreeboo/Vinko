-- ============================================================================
-- VINKO — 0075_motor_catalogo_co: catálogo de COLOMBIA del agente (F1, B.3.1).
--
-- Sustituye al catálogo de España de 0024 (que queda market='ES', inactivo).
-- activo=true en las entidades más fuertes de cada categoría; el resto queda
-- cargado y se enciende desde /admin/catalogo. La política entra solo con
-- revisión humana (Nivel B) y nace apagada.
--
-- Fuera siempre (B.15): menores (nada de programas infantiles ni categorías de
-- cantera), delitos de particulares, violencia y vida privada.
--
-- IDEMPOTENTE: on conflict (nombre) do nothing — re-aplicarla (el deploy lo
-- hace en cada merge) no pisa lo que se edite en el panel.
-- ============================================================================

-- Las semillas de España (0024) quedan fuera del barrido de Colombia.
update public.tracked_entities set activo = false where market = 'ES' and activo;

-- Westcol y Juansguarnizo son colombianos: estaban sembrados (inactivos) en ES.
update public.tracked_entities
   set market = 'CO', pais = 'CO', activo = (nombre = 'Westcol'),
       palabras_clave = case nombre when 'Westcol' then array['Westcol','Westcol stream']
                                    else array['Juansguarnizo','Juan Guarnizo'] end
 where nombre in ('Westcol', 'Juansguarnizo') and market = 'ES';

insert into public.tracked_entities (nombre, categoria, palabras_clave, aliases, external_ids, market, pais, activo) values
  -- fútbol colombiano (desenlace cada fecha de fábrica)
  ('Liga BetPlay',            'futbol', array['Liga BetPlay','Dimayor fecha Liga BetPlay','cuadrangulares Liga BetPlay'], array['Primera A'], '{"api_football_league":239}', 'CO', 'CO', true),
  ('Millonarios',             'futbol', array['Millonarios FC','Millonarios partido'], array['Millos','Embajadores'], '{}', 'CO', 'CO', true),
  ('Atlético Nacional',       'futbol', array['Atlético Nacional','Nacional Medellín partido'], array['Verdolaga','Verde Paisa'], '{}', 'CO', 'CO', true),
  ('América de Cali',         'futbol', array['América de Cali'], array['Diablos Rojos','La Mechita'], '{}', 'CO', 'CO', true),
  ('Junior de Barranquilla',  'futbol', array['Junior de Barranquilla','Junior FC partido'], array['Tiburón'], '{}', 'CO', 'CO', false),
  ('Independiente Santa Fe',  'futbol', array['Independiente Santa Fe'], array['Cardenales','Santa Fe'], '{}', 'CO', 'CO', false),
  ('Deportivo Cali',          'futbol', array['Deportivo Cali'], array['Azucareros'], '{}', 'CO', 'CO', false),
  ('Independiente Medellín',  'futbol', array['Independiente Medellín','DIM partido'], array['DIM','Poderoso'], '{}', 'CO', 'CO', false),
  ('Selección Colombia',      'futbol', array['Selección Colombia partido','Selección Colombia convocatoria'], array['La Tricolor'], '{}', 'CO', 'CO', true),
  ('Luis Díaz',               'futbol', array['Luis Díaz'], array['Lucho Díaz'], '{}', 'CO', 'CO', true),
  ('James Rodríguez',         'futbol', array['James Rodríguez'], array[]::text[], '{}', 'CO', 'CO', false),
  ('Jhon Durán',              'futbol', array['Jhon Durán'], array[]::text[], '{}', 'CO', 'CO', false),
  ('Copa Libertadores',       'futbol', array['Copa Libertadores'], array['Libertadores'], '{"api_football_league":13}', 'CO', 'CO', true),
  ('Copa Sudamericana',       'futbol', array['Copa Sudamericana'], array['Sudamericana'], '{"api_football_league":11}', 'CO', 'CO', false),
  ('UEFA Champions League',   'futbol', array['Champions League'], array['Champions'], '{"api_football_league":2}', 'GLOBAL', 'CO', true),
  -- realities de televisión
  ('La Casa de los Famosos Colombia', 'reality_tv', array['La Casa de los Famosos Colombia','La Casa de los Famosos Colombia nominados','La Casa de los Famosos Colombia eliminado'], array['LCDLF Colombia'], '{}', 'CO', 'CO', true),
  ('MasterChef Celebrity Colombia',   'reality_tv', array['MasterChef Celebrity Colombia'], array['MasterChef Colombia'], '{}', 'CO', 'CO', true),
  ('Desafío The Box',                 'reality_tv', array['Desafío The Box','Desafío Caracol'], array['El Desafío'], '{}', 'CO', 'CO', true),
  ('Yo Me Llamo',                     'reality_tv', array['Yo Me Llamo Caracol'], array[]::text[], '{}', 'CO', 'CO', false),
  -- streamers y creadores
  ('Mr Stiven Tc',   'streamer', array['Mr Stiven Tc'], array[]::text[], '{}', 'CO', 'CO', false),
  ('Ami Rodríguez',  'streamer', array['Ami Rodríguez'], array[]::text[], '{}', 'CO', 'CO', false),
  -- música y farándula
  ('Karol G',          'musica', array['Karol G'], array['La Bichota'], '{}', 'CO', 'CO', true),
  ('Feid',             'musica', array['Feid'], array['Ferxxo'], '{}', 'CO', 'CO', true),
  ('Shakira',          'musica', array['Shakira'], array[]::text[], '{}', 'CO', 'CO', true),
  ('J Balvin',         'musica', array['J Balvin'], array[]::text[], '{}', 'CO', 'CO', false),
  ('Maluma',           'musica', array['Maluma'], array[]::text[], '{}', 'CO', 'CO', false),
  ('Blessd',           'musica', array['Blessd'], array[]::text[], '{}', 'CO', 'CO', false),
  ('Ryan Castro',      'musica', array['Ryan Castro'], array[]::text[], '{}', 'CO', 'CO', false),
  ('Silvestre Dangond','musica', array['Silvestre Dangond'], array[]::text[], '{}', 'CO', 'CO', false),
  ('Carlos Vives',     'musica', array['Carlos Vives'], array[]::text[], '{}', 'CO', 'CO', false),
  -- premios y concursos
  ('Latin Grammy',               'cultura', array['Latin Grammy'], array['Grammy Latino'], '{}', 'GLOBAL', 'CO', true),
  ('Premios Lo Nuestro',         'cultura', array['Premios Lo Nuestro'], array[]::text[], '{}', 'GLOBAL', 'CO', false),
  ('Premios Juventud',           'cultura', array['Premios Juventud'], array[]::text[], '{}', 'GLOBAL', 'CO', false),
  ('Premios Nuestra Tierra',     'cultura', array['Premios Nuestra Tierra'], array[]::text[], '{}', 'CO', 'CO', false),
  ('Balón de Oro',               'futbol',  array['Balón de Oro'], array[]::text[], '{}', 'GLOBAL', 'CO', false),
  ('Señorita Colombia',          'cultura', array['Señorita Colombia','Concurso Nacional de Belleza'], array['Reinado de Cartagena'], '{}', 'CO', 'CO', true),
  ('Miss Universo',              'cultura', array['Miss Universo'], array[]::text[], '{}', 'GLOBAL', 'CO', false),
  -- otros deportes
  ('Egan Bernal',      'deporte', array['Egan Bernal'], array[]::text[], '{}', 'CO', 'CO', false),
  ('Nairo Quintana',   'deporte', array['Nairo Quintana'], array[]::text[], '{}', 'CO', 'CO', false),
  ('Fórmula 1',        'deporte', array['Fórmula 1 Gran Premio'], array['F1'], '{}', 'GLOBAL', 'CO', false),
  -- fechas fijas de Colombia
  ('Carnaval de Barranquilla',  'estacional', array['Carnaval de Barranquilla'], array[]::text[], '{}', 'CO', 'CO', false),
  ('Festival de la Leyenda Vallenata', 'estacional', array['Festival Vallenato rey vallenato'], array['Festival Vallenato'], '{}', 'CO', 'CO', false),
  ('Feria de las Flores',       'estacional', array['Feria de las Flores Medellín'], array[]::text[], '{}', 'CO', 'CO', false),
  -- política (Nivel B: siempre con persona; nace apagada)
  ('Congreso de Colombia',      'politica', array['Congreso de Colombia votación','Senado de Colombia proyecto de ley'], array['Congreso','Senado'], '{}', 'CO', 'CO', false),
  ('Presidencia de Colombia',   'politica', array['Presidente de Colombia anuncia'], array['Casa de Nariño'], '{}', 'CO', 'CO', false)
on conflict (nombre) do nothing;
