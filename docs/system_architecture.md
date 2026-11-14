# Arquitectura del Sistema: ASIGBO Proctoring

## 1. Stack Tecnológico
- **Framework:** Next.js (App Router)
- **Lenguaje:** TypeScript
- **Estilos:** Tailwind CSS + shadcn/ui (recomendado para componentes del panel admin)
- **Base de Datos:** PostgreSQL alojada en [Neon.tech](https://neon.tech/)
- **ORM:** Prisma ORM
- **Deployment:** Vercel

## 2. Modelo de Datos (Prisma Schema Overview)
El sistema requiere una base de datos relacional robusta para soportar el dinamismo de las pruebas:
1. **Exam:** Almacena la configuración general de la prueba (título, descripción, tiempo límite, estado activo/inactivo).
2. **Question & Option:** Define la estructura del formulario (tipo de pregunta, texto, URLs de imágenes de apoyo) y las opciones correctas para auto-calificación.
3. **CandidateSession:** Traza la sesión del alumno (inicio, fin, punteo obtenido y estado de la prueba).
4. **AuditLog:** Registro inmutable de eventos de trampa (ej. `TAB_CHANGE`, `PASTE_ATTEMPT`, `FULLSCREEN_EXIT`), vinculado a la sesión del candidato.

## 3. Motor Anti-Trampas (Client-side Security)
Componente `ProctorWrapper.tsx` que envuelve el examen e intercepta eventos DOM:
- **Pérdida de Foco:** `document.addEventListener('visibilitychange')` y `window.onblur`.
- **Pantalla Completa:** `document.addEventListener('fullscreenchange')`.
- **Bloqueo de UI:** `onContextMenu`, `onCopy`, `onPaste`, `onCut`, y captura global de teclado para combinaciones prohibidas (Meta+C, F12, etc.).
- **Acción:** Cada infracción dispara un Server Action que guarda el evento en `AuditLog`.

## 4. Estrategia de Real-time Monitoring (Admin Dashboard)
Dado que Vercel opera en un entorno Serverless (que no mantiene conexiones WebSockets persistentes de forma nativa), el Live Dashboard (`/admin/live`) utiliza una de las siguientes estrategias:
- **Opción A (Polling):** Uso de SWR o React Query para hacer *polling* a la base de datos cada 3-5 segundos buscando nuevos registros en `AuditLog`.
- **Opción B (Event-driven):** Integración de un servicio de terceros como **Pusher** para emitir eventos desde los Server Actions hacia el cliente del administrador de manera instantánea.