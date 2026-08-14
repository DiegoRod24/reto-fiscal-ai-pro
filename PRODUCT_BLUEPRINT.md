# PRODUCT BLUEPRINT · SOLO HYPERLEARNING

## Arquitectura decidida
Una persona → un dispositivo → progreso local.

No se usa Supabase, login, OAuth ni cuentas múltiples.

## Persistencia
- Perfil y preferencias: localStorage.
- Intentos, XP y dominio: localStorage.
- Repetición espaciada: localStorage.
- Sesión interrumpida: localStorage.
- App shell offline: Service Worker.
- Backup manual: JSON.

## Casuísticas cubiertas
- micrófono denegado → teclado;
- reconocimiento de voz no disponible → teclado;
- internet cae → sigue con caché;
- cierre accidental → continuar sesión;
- cambio de pestaña → registra interrupción;
- errores consecutivos → Recovery Lab;
- teléfono lento → desactivar animaciones;
- sin vibración/Wake Lock/View Transitions → degradación segura;
- actualización de Cloudflare → caché versionada;
- cambio de móvil → exportar/importar respaldo.

## Próximas mejoras manteniendo todo local
- campaña/historia por capítulos;
- calendario de repaso;
- streak freeze;
- skins/temas desbloqueables;
- Audio Coach realmente manos libres;
- avatar Rive o Live2D estático;
- panel local para validar claves;
- selector de materias y duración de sesión.
