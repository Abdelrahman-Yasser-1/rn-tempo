type FeatureBadgeProps = Readonly<{
  /** Module name from contract C7.1, e.g. `ssl-pinning`. */
  name: string;
  /** Whether `tempo feature remove` can delete the module. Defaults to true. */
  removable?: boolean;
}>;

/** A pill with the module name and whether it can be removed. */
export function FeatureBadge({ name, removable = true }: FeatureBadgeProps) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border bg-fd-card px-2.5 py-0.5 text-xs">
      <code>{name}</code>
      <span className={removable ? 'text-green-700 dark:text-green-300' : 'text-fd-muted-foreground'}>
        {removable ? 'removable module' : 'core, not removable'}
      </span>
    </span>
  );
}
