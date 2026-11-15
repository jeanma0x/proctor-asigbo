# Envío de correos (invitaciones a exámenes)

El sistema envía las invitaciones por **SMTP** (`lib/email.ts`, nodemailer). Funciona con cualquier proveedor.

## Proveedor recomendado: Brevo (gratis)
- Plan gratuito: **300 correos/día**, sin tarjeta. Permite verificar **una sola dirección remitente** (no exige tener dominio).
- Alternativas: Resend (3 000/mes, pero exige verificar un dominio propio para escribir a terceros) o Gmail con contraseña de aplicación (límite ~500/día).

## Pasos con Brevo
1. Crear cuenta en brevo.com.
2. *Senders, Domains & Dedicated IPs → Senders → Add a sender*: registrar `directiva.asigbo@gmail.com` y confirmar con el código que llega.
3. *SMTP & API → SMTP → Generate a new SMTP key*. Copiar el **login SMTP** y la **clave**.
4. Cargar en Vercel (Production) y en `.env` local:

```
SMTP_HOST=smtp-relay.brevo.com
SMTP_PORT=587
SMTP_USER=<login SMTP que muestra Brevo>
SMTP_PASS=<clave SMTP>
SMTP_FROM="ASIGBO Proctoring <directiva.asigbo@gmail.com>"
APP_URL=https://proctor-asigbo.vercel.app
```
5. Redesplegar. En *Enlaces de acceso* desaparece el aviso y aparecen los botones «Enviar correo».

## Entregabilidad
Con un remitente `@gmail.com` los correos pueden llegar a spam. Lo ideal es un **dominio propio de ASIGBO** (p. ej. `proctoring@asigbo.org`) verificado en el proveedor (registros SPF/DKIM).

## Sin configurar nada
Siempre están disponibles «WhatsApp» y «Abrir en mi correo» en cada fila.
