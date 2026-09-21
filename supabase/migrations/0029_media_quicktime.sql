-- Vídeos de la galería del iPhone: Safari los entrega como .MOV (video/quicktime)
-- y el bucket los rechazaba ("no se pudo subir"). 0017 crea el bucket con
-- `on conflict do nothing`, así que el cambio va aquí.
update storage.buckets
   set allowed_mime_types = array_append(allowed_mime_types, 'video/quicktime')
 where id = 'porra-media'
   and not ('video/quicktime' = any(allowed_mime_types));
