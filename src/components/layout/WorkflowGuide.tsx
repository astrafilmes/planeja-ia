import type { ReactNode } from"react";
import { Link } from"@tanstack/react-router";
import {
 ArrowRight,
 CheckCircle2,
 FileSignature,
 FileText,
 FileUp,
 Send,
} from"lucide-react";

type WorkflowStep = {
 label: string;
 description: string;
 to?: string;
 icon?: typeof FileText;
 state?:"done" |"active" |"idle";
};

type WorkflowGuideProps = {
	title?: string;
	steps?: WorkflowStep[];
	aside?: ReactNode;
	compact?: boolean;
};

const defaultSteps: WorkflowStep[] = [
	{
		label: "Importar",
		description: "Planilha e vínculo com portal",
		to: "/importar-contratos",
		icon: FileUp,
	},
	{
		label: "Processos",
		description: "Processo-mãe e atas",
		to: "/processos",
		icon: FileText,
	},
	{
		label: "Contratos",
		description: "Revisão e documentos",
		to: "/contratos",
		icon: FileSignature,
	},
	{
		label: "Enviar",
		description: "Portal e PDFs finais",
		to: "/contratos",
		icon: Send,
	},
];

export function WorkflowGuide({
	title = "Fluxo recomendado",
	steps = defaultSteps,
	aside,
	compact = false,
}: WorkflowGuideProps) {
	const wrapperClass = compact
		? "flex flex-col gap-3"
		: "mb-6 rounded-xl border border-border/60 bg-card p-4 shadow-sm";
	const innerClass = compact
		? "flex flex-col gap-3"
		: "flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between";
	const gridClass = compact
		? "grid gap-2"
		: "grid gap-2 md:grid-cols-2 xl:grid-cols-4";
	return (
		<section className={wrapperClass}>
			<div className={innerClass}>
				{!compact && (
					<div className="flex min-w-0 items-center gap-3">
						<div className="hidden h-10 w-1 rounded-full bg-primary md:block" />
						<div className="min-w-0">
							<h2 className="text-sm font-semibold text-foreground">
								{title}
							</h2>
							<p className="line-clamp-2 text-sm text-muted-foreground">
								Use esta sequência para sair da planilha e chegar ao contrato
								enviado, sem voltar procurando a próxima etapa.
							</p>
						</div>
					</div>
				)}

				<div className={gridClass}>

 {steps.map((step, index) => {
 const Icon = step.icon ?? FileText;
 const isActive = step.state ==="active";
 const isDone = step.state ==="done";
 const content = (
 <div
 className={`flex h-full items-center gap-2 rounded-md border px-3 py-2 text-left transition-colors ${
 isActive
 ?"border-primary/50 bg-primary/10 text-primary"
 : isDone
 ?"border-primary/25 bg-primary/5 text-primary"
 :"border-border/60 bg-muted/40 text-foreground/85 hover:border-primary/30 hover:bg-primary/5 dark:bg-muted/30 "
 }`}
 >
 <div
 className={`grid size-8 shrink-0 place-items-center rounded-md ${
 isActive
 ?"bg-primary text-primary-foreground"
 : isDone
 ?"bg-primary text-primary-foreground"
 :"bg-card text-muted-foreground shadow-sm "
 }`}
 >
 {isDone ? (
 <CheckCircle2 className="size-4" />
 ) : (
 <Icon className="size-4" />
 )}
 </div>
 <div className="min-w-0 flex-1">
 <div className="truncate text-xs font-semibold">
 {index + 1}. {step.label}
 </div>
 <div className="truncate text-[11px] text-muted-foreground">
 {step.description}
 </div>
 </div>
 {step.to && <ArrowRight className="size-3.5 shrink-0" />}
 </div>
 );

 return step.to ? (
 <Link key={`${step.label}-${index}`} to={step.to as any}>
 {content}
 </Link>
 ) : (
 <div key={`${step.label}-${index}`}>{content}</div>
 );
 })}
 </div>

 {aside && <div className="shrink-0">{aside}</div>}
 </div>
 </section>
 );
}
