import { Suspense } from "react";
import type { Metadata } from "next";
import { ShieldAlert } from "lucide-react";
import { prisma } from "@/lib/prisma";
import ProctorWrapper from "@/components/proctor/ProctorWrapper";
import ExamForm from "@/components/proctor/ExamForm";
import { seededShuffle } from "@/lib/shuffle";

export const metadata: Metadata = {
  title: "Examen · ASIGBO Proctoring",
  description: "Entorno seguro de evaluación para becas ASIGBO.",
  robots: { index: false },
};

function Notice({ title, text }: { title: string; text: string }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-paper p-6">
      <div className="max-w-md text-center">
        <ShieldAlert className="mx-auto mb-4 h-12 w-12 text-slate-400" aria-hidden="true" />
        <h1 className="font-serif text-2xl font-semibold text-slate-900">{title}</h1>
        <p className="mt-2 text-base leading-relaxed text-slate-700">{text}</p>
      </div>
    </main>
  );
}

// Los datos de sesión se leen en cada request (Cache Components: dentro de <Suspense>).
export default function ExamPage(props: {
  params: Promise<{ examId: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  return (
    <Suspense fallback={<Notice title="Cargando examen…" text="Un momento por favor." />}>
      <ExamContent {...props} />
    </Suspense>
  );
}

async function ExamContent({
  params,
  searchParams,
}: {
  params: Promise<{ examId: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const { examId } = await params;
  const sp = await searchParams;
  const sessionId = typeof sp.session === "string" ? sp.session : undefined;

  if (!sessionId) {
    return <Notice title="Enlace inválido" text="Falta el identificador de sesión. Usa el enlace que te envió ASIGBO." />;
  }

  const session = await prisma.candidateSession.findUnique({
    where: { id: sessionId },
    include: {
      candidate: { select: { fullName: true } },
      // Respuestas autoguardadas (hidratación si el candidato recargó la página).
      answers: { select: { questionId: true, selectedOptionId: true, textResponse: true } },
      exam: {
        select: {
          id: true,
          title: true,
          status: true,
          durationMinutes: true,
          shuffleQuestions: true,
          shuffleOptions: true,
          questions: {
            orderBy: { position: "asc" },
            select: {
              id: true,
              text: true,
              type: true,
              imageUrl: true,
              points: true,
              // Nunca se envía isCorrect al cliente.
              options: { orderBy: { position: "asc" }, select: { id: true, text: true } },
            },
          },
        },
      },
    },
  });

  if (!session || session.examId !== examId) {
    return <Notice title="Este enlace ya no es válido" text="No encontramos un examen asignado a este enlace. Puede que se haya quitado o reemplazado por uno nuevo. Escribe a la Junta Directiva de ASIGBO para que te envíen tu enlace actualizado." />;
  }
  if (session.status === "SUBMITTED") {
    return <Notice title="Examen ya entregado" text="Esta sesión ya fue completada." />;
  }
  if (session.status === "TERMINATED") {
    return <Notice title="Sesión terminada" text="Esta sesión fue cerrada por infracciones a las reglas de integridad." />;
  }
  if (session.exam.status !== "PUBLISHED") {
    return <Notice title="Examen no disponible" text="El examen aún no está publicado o ya fue cerrado." />;
  }

  const initialChoices: Record<string, string> = {};
  const initialTexts: Record<string, string> = {};
  for (const a of session.answers) {
    if (a.selectedOptionId) initialChoices[a.questionId] = a.selectedOptionId;
    if (a.textResponse) initialTexts[a.questionId] = a.textResponse;
  }

  // Orden aleatorio por candidato, estable al recargar (semilla = id de sesión).
  let questions = session.exam.questions;
  if (session.exam.shuffleQuestions) questions = seededShuffle(questions, `${session.id}:q`);
  if (session.exam.shuffleOptions)
    questions = questions.map((q) => (q.type === "MULTIPLE_CHOICE" ? { ...q, options: seededShuffle(q.options, `${session.id}:o:${q.id}`) } : q));
  const totalPoints = questions.reduce((n, q) => n + q.points, 0);

  return (
    <ProctorWrapper
      sessionId={session.id}
      candidateName={session.candidate.fullName}
      examTitle={session.exam.title}
      initialFlagCount={session.flagCount}
      durationMinutes={session.exam.durationMinutes}
      questionCount={questions.length}
      totalPoints={totalPoints}
    >
      <ExamForm
        sessionId={session.id}
        examTitle={session.exam.title}
        candidateName={session.candidate.fullName}
        questions={questions}
        initialChoices={initialChoices}
        initialTexts={initialTexts}
      />
    </ProctorWrapper>
  );
}
