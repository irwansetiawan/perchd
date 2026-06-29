// Single-quote wrap, escaping embedded single quotes as the classic '\'' idiom.
// Safe because the command is spawned with shell:true.
function shellQuote(arg: string): string {
  return `'${arg.replace(/'/g, `'\\''`)}'`;
}

export function appendPassthrough(command: string, args: string[]): string {
  if (args.length === 0) return command;
  return `${command} ${args.map(shellQuote).join(" ")}`;
}
