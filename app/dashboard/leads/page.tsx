import { createClient } from '@supabase/supabase-js'
import { Page, PageHeader, Card, EmptyState, Table, Row, Cell, Badge } from '../ui'

// Service-role client, not the cookie-bound anon client — leads has RLS
// enabled with no policy for the authenticated role, so the anon client
// silently returned zero rows here regardless of real data (see
// dashboard/page.tsx for the full explanation).
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

export default async function LeadsPage() {
  // The 7-day count is done by the database rather than filtered in JS, so the
  // page doesn't have to hold every row in memory to produce it.
  //
  // react-hooks/purity flags Date.now() because an impure read during render is
  // unstable across re-renders — but this is an async Server Component, which
  // renders exactly once per request and never re-renders. Reading the clock
  // here is the intended behaviour: each request gets its own 7-day window.
  // eslint-disable-next-line react-hooks/purity
  const weekAgo = new Date(Date.now() - 7 * 86_400_000).toISOString()

  const [{ data: leads }, { count: recentCount }] = await Promise.all([
    supabase
      .from('leads')
      .select('id, name, phone, interests, source, created_at')
      .order('created_at', { ascending: false })
      .limit(500),
    supabase
      .from('leads')
      .select('*', { count: 'exact', head: true })
      .gte('created_at', weekAgo),
  ])

  const rows = leads ?? []
  const count = rows.length
  const recent = recentCount ?? 0

  return (
    <Page>
      <PageHeader
        title="Leads"
        subtitle={
          count === 0
            ? 'Everyone who submits the quote form lands here'
            : `${count} total · ${recent} in the last 7 days`
        }
      />

      <Card padded={false}>
        {count === 0 ? (
          <EmptyState
            title="No leads yet"
            hint="They'll appear here the moment someone submits the quote form on the landing page."
          />
        ) : (
          <Table
            columns={[
              { label: 'Name' },
              { label: 'Phone' },
              { label: 'Interested in' },
              { label: 'Source' },
              { label: 'Date', align: 'right' },
            ]}
          >
            {rows.map(lead => (
              <Row key={lead.id}>
                <Cell strong>{lead.name}</Cell>
                <Cell>
                  <a
                    href={`tel:${lead.phone.replace(/\D/g, '')}`}
                    className="hover:text-blue-400 transition-colors"
                  >
                    {lead.phone}
                  </a>
                </Cell>
                <Cell>{lead.interests || '—'}</Cell>
                <Cell>
                  <Badge tone={lead.source === 'website_form' ? 'blue' : 'neutral'}>
                    {lead.source === 'website_form' ? 'Website' : lead.source || 'unknown'}
                  </Badge>
                </Cell>
                <Cell align="right" muted nowrap>
                  {fmtDate(lead.created_at)}
                </Cell>
              </Row>
            ))}
          </Table>
        )}
      </Card>
    </Page>
  )
}
