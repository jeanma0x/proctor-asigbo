# Arquitectura del sistema: ASIGBO Proctoring

Documento técnico vivo. Última revisión: noviembre 2026.

## 1. Stack
| Capa | Tecnología |
|---|---|
| Framework | Next.js 16 (App Router, **Cache Components** activado, `proxy.ts` en lugar de `middleware.ts`) |
| UI | React 19, Tailwind CSS v4 (tokens de marca en `app/globals.css`), lucide-react, gráficos SVG propios (`components/admin/charts.tsx`) |
| Datos | PostgreSQL en Neon + Prisma 6 (`prisma/schema.prisma`) |
| Autenticación | Auth.js / NextAuth v4 (credenciales, JWT de 8 h) + bcryptjs |
| Correo | nodemailer por SMTP (Brevo). Ver `docs/EMAIL_SETUP.md` |
| PDF | pdfkit (informes con membrete, `lib/report-pdf.ts`); `serverExternalPackages: ["pdfkit"]` |
| Hosting | Vercel (despliegue automático al hacer push a `main`) |

Nota Cache Components: todo lo que lee cookies/sesión/BD en tiempo de petición va dentro de `<Suspense>`; no se usan `export const dynamic/runtime` en rutas.

## 2. Mapa de módulos
**Panel de administración (`/admin/*`, protegido por `proxy.ts` + validación en servidor):**
Dashboard · Exámenes (lista, editar, duplicar, publicar/cerrar, eliminar) · Constructor (nuevo examen manual o CSV) · Enlaces de acceso (bandeja de aspirantes, correo/WhatsApp, quitar/reiniciar) · Monitoreo en vivo · Convocatorias · Candidatos (directorio y perfil) · Resultados e informes (detalle, calificación manual, PDF/CSV individual y grupal) · Ranking y decisiones · Usuarios y roles · Bitácora · Mi cuenta.

**Zona pública del candidato:** `/` (página informativa) y `/exam/[examId]?session=<id>` (enlace personal).

## 3. Modelo de datos (resumen)
- **Convocatoria** (año): agrupa exámenes. Nada se borra; se archiva. FK `Restrict`.
- **Exam**: título, duración, estado (`DRAFT/PUBLISHED/CLOSED`), `shuffleQuestions/shuffleOptions`, `opensAt/closesAt` (solo restringen el *inicio*).
- **Question / Option**: opción múltiple (autocalificada) y texto abierto (calificación manual).
- **Candidate**: persona (correo único) con historial entre convocatorias; **CandidateNote**: notas internas.
- **CandidateSession**: un intento por (candidato, examen). Estado, puntaje, infracciones, `decision/decidedBy/decidedAt`, `emailSentAt`. FK a examen `Restrict` (conserva el histórico).
- **Answer**: respuesta; `manualScore/gradedBy/gradedAt` para abiertas.
- **AuditLog**: eventos de seguridad del examen (por sesión).
- **AdminActionLog**: bitácora de acciones de los administradores (inmutable).
- **AdminUser**: rol (`SUPERADMIN/ADMIN/REVIEWER`), `isActive`, `tokenVersion`, `mustChangePassword`. **LoginAttempt**: límite de intentos.

## 4. Seguridad
- Sesión JWT validada **contra la BD en cada petición** (`lib/require-admin.ts`): cambiar contraseña, «cerrar en todos los dispositivos» (`tokenVersion`) o desactivar a alguien invalida sus sesiones al instante.
- Bloqueo por 5 intentos fallidos (correo) / 20 (IP) en 15 min (`lib/rate-limit.ts`).
- Permisos por rol en el servidor (`lib/permissions.ts`); la interfaz solo oculta opciones. Toda acción llama a `hasPermission(...)`.
- Encabezados HTTP de seguridad y `noindex` en `/admin` (`next.config.ts`).
- Contraseñas temporales con cambio obligatorio; política común en `lib/password.ts`.
- Bitácora de auditoría (`lib/audit.ts`) en decisiones, calificaciones, exámenes, accesos, usuarios, exportaciones e inicios de sesión.
- Datos personales: son menores de edad en su mayoría; ver «Pendientes» en `docs/ROADMAP.md`.

### Matriz de roles
| Permiso | Superadmin | Administrador | Revisor |
|---|:-:|:-:|:-:|
| Dashboard, monitoreo, resultados, ranking (ver) | ✓ | ✓ | ✓ |
| Crear/editar exámenes, convocatorias, habilitar aspirantes | ✓ | ✓ | – |
| Decidir (seleccionar), calificar abiertas, notas, corregir candidatos | ✓ | ✓ | – |
| Cerrar un examen en vivo, exportar PDF/CSV | ✓ | ✓ | – |
| Usuarios y roles, bitácora | ✓ | – | – |

## 5. Motor anti-trampas (cliente)
`components/proctor/ProctorWrapper.tsx` exige pantalla completa y registra pérdida de foco, cambio de pestaña, salida de pantalla completa y intentos de copiar/pegar/menú contextual (`actions/proctor.ts`). 3 advertencias (`MAX_STRIKES`) cierran el examen. El temporizador lo fija el servidor; el autoguardado es por pregunta; el orden aleatorio es determinista por sesión (`lib/shuffle.ts`).

## 6. Calificación y ranking
- Puntaje = opción múltiple (auto) + notas manuales de abiertas.
- `lib/ranking.ts`: métodos *bruto*, *ponderado por dificultad* y *ponderado + integridad* (−5 por infracción), desempates por infracciones, tiempo y hora de entrega. Una pregunta abierta entra al índice solo cuando todas las entregas están calificadas en ella.
- Las decisiones (seleccionado / lista de espera / no seleccionado) se guardan por sesión con autor y fecha.

## 7. Monitoreo en vivo
Polling con SWR cada 3 s (`actions/live.ts`); Vercel serverless no mantiene WebSockets. Alternativa futura: Pusher. Al detectar una infracción nueva el panel la muestra en el feed «Infracciones en vivo», con opción de sonido/notificación del navegador y contador en el título de la pestaña. Al llegar a 3 infracciones aparece un aviso para pedir al candidato que salga de Zoom. El panel «Detalle» da la línea de tiempo con segundos y un **acta** copiable que justifica el cierre (`getSessionDetail`).

### Ayuda, salidas autorizadas y anulaciones
- **Pedir ayuda** (candidato): botón en la barra del examen, con motivo y texto opcional (`requestHelp`, una solicitud por minuto). La Junta la ve como banner y en el feed, con sonido.
- **Autorizar salida de 2 min** (`grantLeave`, permiso `live:terminate`): durante la ventana (`graceUntil`) `logInfraction` registra la salida como «autorizada» y **no suma infracción**. El candidato ve una cuenta regresiva (consulta `getHelpState` cada 4 s tras pedir ayuda).
- **Anular infracción** (`voidInfraction`): exige motivo; baja `flagCount`, conserva el evento marcado como anulado (`voidedAt/By/Reason`) y lo lista en el acta. Si el examen se había cerrado al llegar a 3 y la anulación lo deja por debajo, **solo un superadmin** puede reabrirlo y solo si aún queda tiempo (el reloj del servidor no se detiene). El candidato debe recargar su enlace.
- Todo queda en la bitácora de acciones y en el historial del examen.

## 8. Variables de entorno
| Variable | Uso |
|---|---|
| `DATABASE_URL`, `DIRECT_URL` | Neon (pooled / directa) |
| `NEXTAUTH_SECRET` | Firma de sesiones |
| `NEXTAUTH_URL` | URL pública (local: `http://localhost:3000`) |
| `APP_URL` | URL pública usada en los enlaces de los correos (prod: la URL de Vercel) |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM` | Envío de correo (Brevo) |

Cambiar `.env`, `next.config.ts` o el esquema de Prisma requiere **reiniciar** `next dev`; el código normal se recarga solo. Tras cambiar el esquema: `npx prisma db push` (la BD es **compartida** entre local y producción: los cambios aplican a ambos).

## 9. Operación
- **Proceso anual:** crear Convocatoria → duplicar el examen del año anterior → editar → publicar → habilitar aspirantes y enviar enlaces → monitorear → calificar abiertas → ranking y decisiones → informes PDF → archivar la convocatoria.
- **Respaldos:** Neon ofrece restauración a un punto en el tiempo (PITR) y *branches*; revisar la retención del plan y hacer un export anual de resultados (CSV/PDF por convocatoria).
- **Rotación de secretos:** regenerar `NEXTAUTH_SECRET` cierra todas las sesiones; la clave SMTP se regenera en Brevo y se actualiza en Vercel.
- **Pruebas:** no hay suite automatizada en el repo; las verificaciones se hicieron con navegador (Playwright) contra datos de prueba temporales `@example.com` que se eliminan al terminar. Una suite E2E estable está en la hoja de ruta.
