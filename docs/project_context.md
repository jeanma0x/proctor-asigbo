# Contexto del Proyecto: ASIGBO Proctoring System

## 1. Visión General
Este proyecto es un sistema de evaluación online seguro para los candidatos a la Beca ASIGBO (Asociación de Becados Isabel Gutiérrez de Bosch) cohorte 2027. Reemplaza herramientas genéricas (como Google Forms) por una plataforma propia (SaaS) que garantiza la integridad de la prueba.

## 2. Propósito del Negocio y Usuarios
ASIGBO funciona como un "puente" estratégico para preparar a los jóvenes en diversificado para la beca universitaria de la Fundación Juan Bautista Gutiérrez (FJBG).
- **Candidatos (Tercero Básico):** Realizan la evaluación en un entorno bloqueado y monitoreado.
- **Junta Directiva (Administradores):** Tienen control total sobre la creación, configuración y monitoreo de las evaluaciones.

## 3. Core Features (Características Principales)
1. **Admin Panel & Exam Builder:** Interfaz para que la Junta Directiva cree exámenes dinámicos. Permite agregar preguntas manualmente (Múltiple opción, texto, carga de imágenes) o de forma masiva subiendo un archivo CSV.
2. **Monitoreo en Vivo (Live Dashboard):** Visualización en tiempo real de los candidatos activos. Emite alertas visuales si un estudiante incumple las reglas de la prueba.
3. **Motor Anti-Trampas (Kiosk Mode):** Entorno estricto que bloquea atajos de teclado (Copy/Paste), detecta pérdida de foco (cambios de pestaña/ventana) y obliga al uso de pantalla completa.

## 4. Reglas de Negocio de la Evaluación
- El temporizador es server-side para evitar manipulaciones locales.
- El candidato tiene un máximo de **3 advertencias** por infracciones de seguridad.
- A la tercera advertencia, el examen se bloquea permanentemente y el estado del candidato pasa a `BLOCKED`.