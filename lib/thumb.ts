// Miniatura JPG de un vídeo (360x640): mismo nombre con ".thumb.jpg", al lado del
// vídeo (public/v/… o el bucket porra-media). Se genera al subir el vídeo
// (MediaCapture en el navegador; ffmpeg para los vídeos de IA). Si no existe,
// quien la pinte cae a la portada temática, nunca a un recuadro negro.
//
// Por qué hace falta: en el móvil un <video> sin autoplay NO pinta su primer
// fotograma (iOS no precarga; Android con datos tampoco), así que una rejilla de
// vídeos sale negra. Instagram usa imágenes fijas; nosotros también.
export function thumbOf(video: string | null | undefined): string | null {
  if (!video) return null;
  const m = video.match(/^(.*)\.(webm|mp4|mov|m4v)(\?.*)?$/i);
  return m ? `${m[1]}.thumb.jpg` : null;
}
