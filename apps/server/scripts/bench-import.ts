import { fetchSiteText } from '../src/services/importer'
import { resolveModel, resolveProviderCredentials } from '../src/services/settings'

const url = process.argv[2] ?? 'https://sitelift.net'

const crawlStart = Date.now()
const { pages, source } = await fetchSiteText(url)
const crawlMs = Date.now() - crawlStart

const model = resolveModel(null)
const creds = resolveProviderCredentials()
const chars = pages.reduce((sum, p) => sum + p.text.length, 0)
console.log(`model=${model} baseUrl=${creds.baseUrl}`)
console.log(`crawl: ${crawlMs}ms, ${pages.length} pages, ${chars} chars, source=${source}`)
console.log(`text preview: ${pages[0]?.text.slice(0, 300).replace(/\n/g, ' ')}`)

const extractStart = Date.now()
const facts = await (await import('../src/services/importer')).extractBusinessFacts(pages, model)
const extractMs = Date.now() - extractStart

console.log(`extract: ${extractMs}ms`)
console.log(`total: ${crawlMs + extractMs}ms`)
console.log('--- facts ---')
console.log(JSON.stringify(facts, null, 2))
