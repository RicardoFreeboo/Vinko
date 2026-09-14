#!/usr/bin/env bash
# ============================================================
# Vinko — suite de regresión del index.html (v1 web)
# Uso: bash checks.sh   (desde la raíz del repo)
# Verifica invariantes del CLAUDE.md: arranque sagrado del feed,
# z-index, porcentajes enteros, códecs, reglas de oro e i18n.
# ============================================================
set -u
F="index.html"
PASS=0; FAIL=0; ERRS=""

ok(){ PASS=$((PASS+1)); }
ko(){ FAIL=$((FAIL+1)); ERRS="$ERRS\n  ✗ [$1] $2"; }
has(){ grep -qF -- "$2" "$F" && ok || ko "$1" "falta: $2"; }
hasre(){ grep -qE -- "$2" "$F" && ok || ko "$1" "falta patrón: $2"; }
not(){ grep -qiF -- "$2" "$F" && ko "$1" "prohibido presente: $2" || ok; }
notre(){ grep -qiE -- "$2" "$F" && ko "$1" "patrón prohibido presente: $2" || ok; }

[ -f "$F" ] || { echo "ERROR: no existe $F"; exit 2; }

# ---------- 1. Arranque y estructura sagrada ----------
has  S01 'POOLS.forEach(addCard)'
has  S02 'function addCard(p)'
has  S03 'id="tabbar"'
has  S04 'id="feed"'
has  S05 'function renderFeed(keepScroll=true)'
has  S06 'id="betsheet"'
has  S07 'boot();'

# ---------- 2. Z-index: nav SIEMPRE encima ----------
has  Z01 '--z-nav:9999'
has  Z02 '--z-sheet:500'
has  Z03 '--z-view:10'
has  Z06 '--z-modal:10500'
hasre Z04 '#tabbar\{[^}]*z-index:var\(--z-nav\)'
hasre Z05 '\.sheet\{[^}]*z-index:var\(--z-sheet\)'

# ---------- 3. Porcentajes SIEMPRE enteros ----------
has  P01 'Math.round(v*100/total)'
not  P02 '.toFixed('

# ---------- 4. Vídeo/grabadora: negociación de códec (jamás VP9 fijo) ----------
has  V01 'MediaRecorder.isTypeSupported'
has  V02 'codecs=vp8'
has  V03 'codecs=h264'
has  V04 'function pickMime()'
hasre V05 'getTracks\(\)\.forEach\(.*stop\(\)'
has  V06 'class="vv"'
has  V07 'v.play().catch(()=>{})'
hasre V08 'startsWith\("blob:"\)'

# ---------- 5. Confeti: limpieza garantizada (bug histórico) ----------
has  C01 '"animationend", ()=>p.remove()'
hasre C02 'setTimeout\(\(\)=>\{ box.innerHTML=""; \}'

# ---------- 6. Reglas de oro ----------
# 6a. Nada de mecánicas de azar en premios
notre G01 'sorteo|sorteio|raffle|lotter'
# 6b. Puntos jamás comprables ni convertibles
notre G02 'comprar puntos|comprar pontos|buy points'
notre G03 'retirar dinero|sacar dinero|withdraw'
not  G04 'PayPal'
not  G05 'IBAN'
# 6c. Límites de recarga hardcodeados (regla de oro 2)
has  G06 'const DAILY_BASE = 100'
has  G07 'const MAX_AD_RECHARGES = 5'
has  G08 'const AD_RECHARGE_PTS = 90'
AD=$(grep -oE 'const AD_RECHARGE_PTS = [0-9]+' "$F" | grep -oE '[0-9]+')
DB=$(grep -oE 'const DAILY_BASE = [0-9]+' "$F" | grep -oE '[0-9]+')
if [ -n "$AD" ] && [ -n "$DB" ] && [ "$AD" -lt "$DB" ]; then ok; else ko G09 "recarga ($AD) debe ser < asignación base ($DB)"; fi
has  G10 'adsLeft()<=0'
# 6d. Age-gate 18+ delante de afiliación y dinero de grupo (regla de oro 8)
has  G11 'id="agegate"'
has  G12 'badge18'
has  G13 'function affiliate(id){'
hasre G13b 'if\(!S\.age18\)\{ AFTER_AGE'
has  G14 'S.age18===false) return; // menores: nunca'
# 6e. Premios por ranking de PRECISIÓN (regla de oro 3)
has  G15 '"liga.legalnote"'
has  G16 'renderLiga'
# 6f. P2P sin custodia (regla de oro 4): disclaimers presentes
has  G17 '"grupos.debtNote"'
has  G18 '"grupos.paylink"'
# 6g. Afiliación = medición pasiva (regla de oro 6)
has  G19 'affiliate_click'
# 6h. Age-gate de VISIBILIDAD (regla de oro 8): el botón de afiliación solo se ve tras verificar
has  G20 'function affSlot(p)'
has  G21 'if(S.age18===false) return "";'
has  G22 'affSlot(p) : ""'
# 6i. Guard temporal: nada de apostar en porras cerradas/resueltas ni doble tap
has  G23 'p.resolved || p.closes<=Date.now()'
# 6j. window.open endurecido (WebView del APK + noopener)
has  G24 '"noopener,noreferrer"'
has  G25 'function openExternal(url)'
# 6k. Fechas SIEMPRE en hora local (racha/retos/recargas: nada de cortes a las 02:00)
has  G26 'const today = () => dstr(new Date())'
not  G27 'toISOString().slice(0,10)'
# 6l. Flash x2 solo a puntos, jamás a la precisión
has  G28 'const mult = p.flash ? 2 : 1'
# 6m. La banda de resultado pinta el pago real, no cifras fijas
has  G29 'S.paid[p.id] = {share, prec:precGain}'
# 6n. Cap anti-granja de referidos aplicado en código
has  G30 'S.refs.rewardsToday>=MAX_REF_REWARDS_DAY'

# ---------- 6bis. Registro social (mock listo para Supabase OAuth) ----------
has  R01 'id="authsheet"'
has  R02 "authWith('google')"
has  R03 "authWith('apple')"
has  R04 "authWith('x')"
has  R05 "authWith('tiktok')"
has  R06 'function authConfirm()'
has  R07 'if(age<14)'
has  R08 'S.age18 = age>=18'
has  R09 'signInWithOAuth'
not  R10 'type="password"'
has  R11 'data-i18n="auth.guest"'

# ---------- 6ter. Reto 1v1 por voz (contrincante + árbitro aceptado por ambos) ----------
has  D01 'id="crear-reto"'
has  D02 'function startVoice(target)'
has  D03 'webkitSpeechRecognition'
has  D04 'toast(t("voz.no")); return; } // fallback: teclado'
has  D05 'function createDuel()'
has  D06 't("duel.errSame")'
has  D07 'data-i18n="duel.judgeHint"'
has  D08 'S.duels.unshift(d)'
has  D09 'data-i18n="refs.cta300"'
has  D10 "startVoice('nq')"
has  D11 'function duelsHtml()'
# viralidad: deep-links, loop del creador y ciclo del árbitro
has  L01 'function routeHash()'
has  L02 '"hashchange", routeHash'
has  L03 'function poolUrl(id)'
has  L04 'function creditCreatorBonus(p)'
has  L05 'if(got>=500) return;'
has  L06 'function resolveDuels()'
has  L07 't("duel.wonCard"'
has  L08 'function simulateActivity()'

# ---------- 6quater. Supabase (cableado de producción, inerte sin anon key) ----------
has  B01 'const SUPA = {'
has  B02 'uarnpxjdccbidgzhhavc.supabase.co'
not  B03 'service_role'
has  B04 'function supaSession()'
has  B05 'history.replaceState(null, "", location.pathname); // nunca dejar tokens en la URL'
has  B06 'function flushEvents()'
has  B07 '/auth/v1/authorize?provider='
has  B08 'supaSession(); // vuelta de OAuth (limpia el hash de tokens ANTES del router)'
[ -f supabase/schema.sql ] && ok || ko B09 "falta supabase/schema.sql"
grep -q 'security definer' supabase/schema.sql && ok || ko B10 "schema sin RPCs security definer"
grep -q "select 90" supabase/schema.sql && ok || ko B11 "schema sin invariante ad_recharge_pts=90"
grep -qi 'sorteo' supabase/schema.sql && ko B12 "schema contiene 'sorteo'" || ok

# ---------- 7. Instrumentación de analítica (todo desde v1) ----------
NTRACK=$(grep -oF 'track("' "$F" | wc -l)
if [ "$NTRACK" -ge 15 ]; then ok; else ko A01 "solo $NTRACK eventos track(); mínimo 15"; fi
has  A02 'function track(ev, props)'
# a11y mínima
has  A03 'aria-live="polite"'
has  A04 'role="switch"'
has  A05 'role="dialog"'
hasre A06 'documentElement\.lang'

# ---------- 8. i18n: paridad ES / PT-BR / EN y claves usadas ----------
extract_keys(){ sed -n "/<i18n:$1>/,/<\/i18n:$1>/p" "$F" | grep -oE '"[a-z0-9_.]+":' | tr -d '":' | sort -u; }
ES=$(extract_keys es); PT=$(extract_keys pt); EN=$(extract_keys en)
if [ "$ES" = "$PT" ]; then ok; else ko I01 "claves ES≠PT: $(comm -3 <(echo "$ES") <(echo "$PT") | tr '\n' ' ')"; fi
if [ "$ES" = "$EN" ]; then ok; else ko I02 "claves ES≠EN: $(comm -3 <(echo "$ES") <(echo "$EN") | tr '\n' ' ')"; fi
USED=$( { grep -oE '(^|[^A-Za-z_])t\("[a-z0-9_.]+"' "$F" | sed 's/.*t("//;s/"//' | grep -v '\.$';
          grep -oE 'data-i18n="[a-z0-9_.]+"' "$F" | sed 's/data-i18n="//;s/"//';
          grep -oE 'data-i18n-ph="[a-z0-9_.]+"' "$F" | sed 's/data-i18n-ph="//;s/"//';
          grep -oE ' k:"[a-z0-9_]+\.[a-z0-9_.]+"' "$F" | sed 's/ k:"//;s/"//';
          grep -oE 'posK:"[a-z0-9_]+\.[a-z0-9_.]+"' "$F" | sed 's/posK:"//;s/"//'; } | sort -u )
MISS=""
for k in $USED; do echo "$ES" | grep -qx "$k" || MISS="$MISS $k"; done
if [ -z "$MISS" ]; then ok; else ko I03 "claves usadas sin traducción:$MISS"; fi
for k in lvl.0 lvl.1 lvl.2 lvl.3; do echo "$ES" | grep -qx "$k" && ok || ko I04 "falta clave dinámica $k"; done

# ---------- 9. PWA + rendimiento (<2s: sin dependencias externas) ----------
has  W01 'rel="manifest"'
has  W02 'serviceWorker'
[ -f manifest.webmanifest ] && ok || ko W03 "falta manifest.webmanifest"
[ -f sw.js ] && ok || ko W04 "falta sw.js"
notre W05 '<script[^>]+src="http'
notre W06 '<link[^>]+href="http'
notre W07 'url\(http'
notre W08 '@import'
SIZE=$(wc -c < "$F")
if [ "$SIZE" -lt 122880 ]; then ok; else ko W09 "index.html pesa ${SIZE}B (>120KB)"; fi
has  W10 'name="viewport"'
has  W11 '<html lang="es">'
# perf gama media: animaciones pausadas fuera de viewport, sin capas caras
has  W12 'IntersectionObserver'
not  W13 'will-change'
not  W14 'backdrop-filter:blur(3px)'
has  W15 'if(document.hidden) return'

# ---------- resultado ----------
TOTAL=$((PASS+FAIL))
echo "=============================================="
echo " Vinko suite de regresión: $PASS/$TOTAL en verde"
if [ "$FAIL" -gt 0 ]; then echo -e " FALLOS:$ERRS"; exit 1; fi
echo " ✅ Todo en verde"
exit 0
