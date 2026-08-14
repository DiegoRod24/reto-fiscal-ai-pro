# RETO FISCAL AI PRO v2.3 · NOVA ULTRA

## Objetivo
Esta versión convierte el portal en una experiencia mobile-first y voice-first, manteniendo:
- un solo usuario;
- progreso 100% local;
- sin Supabase;
- sin login;
- PWA + Cloudflare Pages.

## Banco
Se conserva el banco de **494 preguntas** de la V2.2.

## Novedades principales
- Nueva identidad visual Reto Fiscal AI Pro.
- Nuevo app icon.
- Wordmark propio `brand-wordmark.svg`.
- Home NOVA ULTRA.
- Selector “¿Cómo quieres estudiar hoy?”:
  - 5 minutos,
  - estudiar bien,
  - solo escuchar,
  - estoy cansada,
  - quiero un reto,
  - examen pronto.
- NOVA más expresiva al hablar.
- Botón flotante de NOVA.
- Update Center.
- `version.json`.
- `changelog.json`.
- búsqueda automática de nueva versión.
- botón “Actualizar ahora”.
- respaldo local antes de actualizar.
- limpieza de caché antigua sin borrar el progreso.
- pantalla “Qué hay de nuevo”.
- historial de versiones.

## Actualizaciones
La aplicación compara:
- `APP_VERSION` local;
- `version.json` remoto.

Cuando exista una nueva versión muestra:
- banner;
- Centro de actualizaciones;
- novedades;
- Actualizar ahora.

## Seguridad del progreso
Antes de actualizar se guarda:
`localStorage["rfsolo_auto_backup"]`

Contiene:
- perfil;
- progreso;
- reanudación de sesión;
- versión anterior.

## Publicación
Reemplaza en GitHub los archivos del proyecto actual por estos y publica en la misma rama que usa Cloudflare Pages.

## Archivos nuevos
- `brand-wordmark.svg`
- `version.json`
- `changelog.json`
