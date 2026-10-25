import Link from 'next/link';

export default function HomePage() {
  return (
    <div className="flex flex-col items-center justify-center text-center flex-1 gap-6 px-4">
      <h1 className="text-4xl font-bold tracking-tight">RN Tempo</h1>
      <p className="text-fd-muted-foreground max-w-md">
        An opinionated, AI-ready React Native template with a CLI, shared lint configs and docs
        that explain every file.
      </p>
      <Link
        href="/docs"
        className="rounded-full bg-fd-primary text-fd-primary-foreground px-6 py-2 text-sm font-semibold hover:opacity-90 transition-opacity"
      >
        Read the docs
      </Link>
    </div>
  );
}
