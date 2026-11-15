# ASIGBO Proctoring

Plataforma de evaluación supervisada para el proceso de becas de ASIGBO. Next.js 16 · React 19 · Tailwind 4 · Prisma 6 · Neon (PostgreSQL) · Vercel.

## Puesta en marcha local
```bash
npm install
# crear .env (ver tabla en docs/system_architecture.md §8)
npx prisma db push      # ¡la base es compartida con producción!
npm run dev             # http://localhost:3000
```
Reinicia `npm run dev` cuando cambies `.env`, `next.config.ts` o el esquema de Prisma.

## Comandos útiles
| Comando | Qué hace |
|---|---|
| `npx tsc --noEmit` | Revisa tipos |
| `npm run lint` | ESLint |
| `npm run build` | Compila para producción (detecta errores de Cache Components) |
| `npx prisma db push` | Aplica el esquema a la base |

## Despliegue
Cada `git push` a `main` despliega en Vercel. Las variables de entorno de producción se administran con `vercel env`.

## Documentación
- [`docs/project_context.md`](docs/project_context.md): qué es y qué reglas de negocio aplica.
- [`docs/system_architecture.md`](docs/system_architecture.md): arquitectura, modelo de datos, seguridad, roles y operación.
- [`docs/EMAIL_SETUP.md`](docs/EMAIL_SETUP.md): configuración del correo (Brevo).
- [`docs/ROADMAP.md`](docs/ROADMAP.md): mejoras pendientes.
