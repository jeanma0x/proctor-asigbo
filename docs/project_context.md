# Contexto del proyecto: ASIGBO Proctoring

## 1. Visión general
Sistema de evaluación en línea, seguro y con trazabilidad, para el proceso de becas de **ASIGBO** (Asociación de Becados Isabel Gutiérrez de Bosch). Reemplaza herramientas genéricas (Google Forms) por una plataforma propia que protege la integridad de la prueba y **conserva el histórico de cada convocatoria, año con año**.

## 2. Usuarios
- **Candidatos** (en su mayoría menores, Tercero Básico): reciben un enlace personal por correo o WhatsApp y presentan el examen en un entorno supervisado.
- **Junta Directiva** (administradores): crean exámenes, habilitan aspirantes, monitorean en vivo, califican, ordenan (ranking), deciden y reportan. Tres roles: Superadmin, Administrador y Revisor (ver matriz en `system_architecture.md`).

## 3. Capacidades
1. Exámenes por convocatoria: constructor manual o CSV, edición, duplicado, orden aleatorio, ventana de apertura/cierre.
2. Acceso por enlaces personales: bandeja de aspirantes (pegar desde Excel), envío por correo (SMTP) o WhatsApp, quitar y reiniciar intentos.
3. Examen seguro: pantalla completa, detección de pérdida de foco, bloqueo de copiar/pegar, 3 advertencias, temporizador del servidor, autoguardado.
4. Monitoreo en vivo con alertas en tiempo real, detalle/acta de infracciones para justificar el cierre y cierre manual.
5. Resultados con respuestas por pregunta, calificación manual de abiertas, perfil de candidato con historial y notas internas.
6. Ranking transparente (3 métodos, desempates, banderas de revisión) y decisiones persistentes (seleccionado / lista de espera / no seleccionado).
7. Reportería con membrete ASIGBO: informe PDF individual y grupal, CSV; dashboard con KPIs e histórico por año.
8. Usuarios y roles, desactivación de accesos y bitácora de auditoría.

## 4. Reglas de negocio
- El tiempo lo controla el servidor; la ventana de apertura/cierre solo restringe el inicio.
- La Junta puede autorizar una salida breve (2 min) o anular una infracción con motivo; el candidato puede pedir ayuda sin salir del examen.
- Máximo **3 advertencias** (`MAX_STRIKES`); a la tercera la sesión pasa a `TERMINATED` y no clasifica.
- Un intento por candidato y examen. Reiniciar descarta el intento anterior (queda registrado en bitácora).
- Un examen con candidatos que ya iniciaron no se puede borrar ni cambiar de convocatoria; sus preguntas quedan bloqueadas para no alterar resultados.
- Las convocatorias no se eliminan: se archivan.
