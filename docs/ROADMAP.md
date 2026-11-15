# Hoja de ruta / mejoras acordadas

## Prioridad del cliente
- ~~Rediseñar las pantallas del candidato~~ **Hecho (ronda 3)**: papel cálido, serif en titulares, franja con los 4 colores del logo, copy humano, navegador de preguntas,
  aviso de tiempo y confirmación de entrega accesible. Pendiente validarlo con candidatos reales y ajustar. Antes se sentían genéricas / "generadas por IA":
  fondo azul degradado oscuro, ícono de escudo genérico, tarjetas estándar. Pendiente: identidad propia de ASIGBO (tono, ilustración, copy humano en
  español guatemalteco, jerarquía y espaciado más cuidados, pantalla de bienvenida cálida). El panel admin está en mejor estado, pero revisar con el mismo criterio.

## Brechas funcionales detectadas
- **Calificación manual de preguntas abiertas**: el puntaje automático solo suma opción múltiple; añadir nota por respuesta y recalcular.
- **Umbral de aprobación y ranking/preselección** de becarios por convocatoria.
- **Reabrir sesión** de un candidato por falla técnica (con registro de quién lo autorizó).
- **Ventana de apertura/cierre del examen** (los campos existen en `Exam.opensAt/closesAt` pero no se aplican).

## Seguridad y gobierno
- **Bitácora de auditoría de administradores** (quién creó, exportó, cerró un examen, cambió roles).
- **Doble factor (2FA)** para superadmin.
- Enlaces de examen con **token aleatorio propio** en lugar del id de sesión.
- **Datos de menores**: política de retención y consentimiento (candidatos de Tercero Básico); exportación/anonimización por convocatoria.
- Copias de seguridad periódicas de la base de datos (Neon: branching / PITR).

## Analítica
- Análisis por pregunta (dificultad, % de acierto, preguntas problemáticas).
- Banco de preguntas reutilizable entre convocatorias.
- Informe PDF por candidato y resumen anual de la convocatoria.

## Hecho
- Ronda 3: edición/duplicado/cierre/eliminación de exámenes (con bloqueo si ya hay candidatos), orden aleatorio de preguntas y opciones por candidato,
  ranking (bruto / ponderado por dificultad / ponderado + integridad) con decisiones persistentes, reportería PDF/CSV con membrete, dashboard con KPIs y gráficos.
- Roles (Superadmin / Administrador / Revisor), desactivar acceso, Convocatorias anuales, Resultados con respuestas, Dashboard e histórico por año,
  límite de intentos de login, invalidación de sesiones, bandeja de aspirantes, envío de correo por SMTP (pendiente de credenciales).
