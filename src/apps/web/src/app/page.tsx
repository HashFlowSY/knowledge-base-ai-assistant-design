import { bootstrapCopy } from "../copy/bootstrap";

export default function HomePage(): React.ReactElement {
  return (
    <main className="min-h-screen bg-background text-foreground">
      <section className="mx-auto flex min-h-screen w-full max-w-5xl flex-col justify-center gap-8 px-6 py-12">
        <div className="space-y-4">
          <p className="text-sm font-medium text-primary">{bootstrapCopy.eyebrow}</p>
          <h1 className="max-w-3xl text-4xl font-semibold tracking-normal text-foreground">
            {bootstrapCopy.title}
          </h1>
          <p className="max-w-2xl text-base leading-7 text-slate-600">
            {bootstrapCopy.description}
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          {bootstrapCopy.statusItems.map((item) => (
            <article
              className="rounded-md border border-border bg-white p-4 shadow-sm"
              key={item.label}
            >
              <h2 className="text-sm font-medium text-slate-900">{item.label}</h2>
              <p className="mt-2 text-sm leading-6 text-slate-600">{item.value}</p>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}
