declare module 'papaparse' {
  const Papa: {
    unparse(input: { fields: string[]; data: unknown[][] }, config?: { newline?: string; escapeFormulae?: boolean }): string
    parse(input: string, config: { header: boolean }): { data: unknown[]; errors: { message: string }[] }
  }
  export default Papa
}
