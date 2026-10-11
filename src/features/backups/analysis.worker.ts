import { analysisCsv } from './analysis.ts'
import type { AnalysisSnapshot } from '../../db/analysis.ts'
self.onmessage = (event: MessageEvent<{ snapshot: AnalysisSnapshot }>) => {
  try {
    self.postMessage({ kind: 'progress', message: 'Preparing analysis CSV' })
    const result = analysisCsv(event.data.snapshot)
    if (!result.count) { self.postMessage({ kind: 'empty' }); return }
    const name = event.data.snapshot.profile.name.replace(/[^\p{L}\p{N}_-]+/gu, '_').slice(0,80) || 'Guest'
    self.postMessage({ kind: 'ready', filename: `Boros_${name}_analysis_${new Date().toISOString().replace(/[:.]/g, '-')}.csv`, blob: new Blob(['\uFEFF', result.csv], { type: 'text/csv;charset=utf-8' }) })
  } catch (error) { self.postMessage({ kind: 'error', message: error instanceof Error ? error.message : 'CSV preparation failed.' }) }
}
