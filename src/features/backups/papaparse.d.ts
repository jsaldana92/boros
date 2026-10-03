declare module 'papaparse' {
  const Papa: { unparse(input: { fields: string[]; data: unknown[][] }, config?: { newline?: string; escapeFormulae?: boolean }): string }
  export default Papa
}
