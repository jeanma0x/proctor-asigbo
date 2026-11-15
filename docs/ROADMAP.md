# Hoja de ruta / mejoras acordadas

## Prioridad del cliente
- ~~Rediseñar las pantallas del candidato~~ **Hecho (ronda 3)**: papel cálido, serif en titulares, franja con los 4 colores del logo, copy humano, navegador de preguntas,
  aviso de tiempo y confirmación de entrega accesible. Pendiente validarlo con candidatos reales y ajustar. Antes se sentían genéricas / "generadas por IA":
  fondo azul degradado oscuro, ícono de escudo genérico, tarjetas estándar. Pendiente: identidad propia de ASIGBO (tono, ilustración, copy humano en
  español guatemalteco, jerarquía y espaciado más cuidados, pantalla de bienvenida cálida). El panel admin está en mejor estado, pero revisar con el mismo criterio.

## Brechas funcionales detectadas
- **Umbral de aprobación y ranking/preselección** de becarios por convocatoria.
- **Reabrir sesión** de un candidato por falla técnica (con registro de quién lo autorizó).

## Seguridad y gobierno
- **Doble factor (2FA)** para superadmin.
- Enlaces de examen con **token aleatorio propio** en lugar del id de sesión.
- **Datos de menores**: política de retención y consentimiento (candidatos de Tercero Básico); exportación/anonimización por convocatoria.
- Copias de seguridad periódicas de la base de datos (Neon: branching / PITR).

## Calidad
- Suite E2E estable (Playwright) en el repositorio contra una base de pruebas aislada (rama de Neon) en lugar de datos QA temporales.
- Acceso por convocatoria (p. ej. un revisor que solo vea la de este año).

## Analítica
- Análisis por pregunta (dificultad, % de acierto, preguntas problemáticas).
- Banco de preguntas reutilizable entre convocatorias.
- Informe PDF por candidato y resumen anual de la convocatoria.

## Hecho
- Ronda 5: bitácora de auditoría, autoría de decisiones y calificaciones con historial por candidato, ventana de apertura/cierre del examen,
  acciones quitar/reiniciar intento, página pública de inicio, documentación técnica actualizada.
- Ronda 4: módulo Candidatos (directorio, perfil con historial entre convocatorias, notas internas, corrección de datos), calificación manual de
  preguntas abiertas con recálculo de puntaje y ranking, correo SMTP (Brevo) activo.
- Ronda 3: edición/duplicado/cierre/eliminación de exámenes (con bloqueo si ya hay candidatos), orden aleatorio de preguntas y opciones por candidato,
  ranking (bruto / ponderado por dificultad / ponderado + integridad) con decisiones persistentes, reportería PDF/CSV con membrete, dashboard con KPIs y gráficos.
- Roles (Superadmin / Administrador / Revisor), desactivar acceso, Convocatorias anuales, Resultados con respuestas, Dashboard e histórico por año,
  límite de intentos de login, invalidación de sesiones, bandeja de aspirantes, envío de correo por SMTP (pendiente de credenciales).
