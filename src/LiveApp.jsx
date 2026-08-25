import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Activity, ArrowUpRight, Box, Building2, Check, ChevronDown, ChevronLeft,
  ChevronRight, ChevronUp, ChevronsUpDown, CircleDot, Crosshair, Diamond, Filter, Flag,
  Focus, Goal, LayoutDashboard, Link2, LoaderCircle, Maximize2, Minus,
  MoreHorizontal, PanelLeftClose, Plus, RefreshCw, Search, Settings2, Sparkles,
  Target, Users, X, Columns3, Rows3, Layers3,
} from 'lucide-react'
import { loadLinearTree } from './linearApi'

const healthMeta = {
  ontrack: { label: 'On track', color: '#3b9b70' },
  atrisk: { label: 'At risk', color: '#d99032' },
  blocked: { label: 'Off track', color: '#d85a5a' },
  planned: { label: 'No update', color: '#778197' },
}

const SELECTION_STORAGE_KEY = 'linear-initiative-tree:selected-roots:v1'
const GROUPING_STORAGE_KEY = 'linear-initiative-tree:project-grouping:v1'
const TOKEN_STORAGE_KEY = 'linear-initiative-tree:linear-token:v1'

function readStoredToken() {
  try { return window.localStorage.getItem(TOKEN_STORAGE_KEY) || '' } catch { return '' }
}

function readStoredSelection() {
  try {
    const value = JSON.parse(window.localStorage.getItem(SELECTION_STORAGE_KEY) || '[]')
    return Array.isArray(value) && value.every(id => typeof id === 'string') ? value : []
  } catch {
    return []
  }
}

function readStoredGrouping() {
  try {
    const value = window.localStorage.getItem(GROUPING_STORAGE_KEY)
    return ['health', 'owner', 'none'].includes(value) ? value : 'health'
  } catch {
    return 'health'
  }
}

function Status({ health = 'planned', compact = false }) {
  const meta = healthMeta[health] || healthMeta.planned
  return <span className={`status ${compact ? 'compact' : ''}`} style={{ '--status': meta.color }}><i />{!compact && meta.label}</span>
}

function Progress({ value = 0, color = '#6c5ce7' }) {
  return <div className="progress"><span style={{ width: `${Math.max(0, Math.min(100, value))}%`, background: color }} /></div>
}

function Sparkline({ project }) {
  const total = project.issueCountHistory || []
  const done = project.completedIssueCountHistory || []
  let values = done.length ? done.slice(-7).map((value, index) => total.at(index - Math.min(7, total.length)) ? value / total.at(index - Math.min(7, total.length)) : value) : []
  if (values.length < 2) values = [0, Math.max(.05, project.progress / 200), project.progress / 100]
  const max = Math.max(...values), min = Math.min(...values)
  const points = values.map((v, i) => `${i * (66 / Math.max(values.length - 1, 1))},${23 - ((v - min) / Math.max(max - min, .01)) * 17}`).join(' ')
  return <svg className="sparkline" viewBox="0 0 66 26"><polyline points={points} fill="none" stroke={healthMeta[project.health]?.color || '#778197'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
}

function Logo() {
  return <div className="logo"><span /><span /><span /><span /><span /></div>
}

function Sidebar({ workspace, viewer, activeView, onNavigate, onForgetToken }) {
  const initials = viewer?.split(/\s+/).slice(0, 2).map(part => part[0]).join('').toUpperCase() || 'LI'
  return <aside className="sidebar">
    <div className="workspace-switch"><Logo /><span>{workspace || 'Linear'}</span><ChevronsUpDown size={14} /></div>
    <nav className="nav-main">
      <button><Search size={16} /><span>Search</span><kbd>Q</kbd></button>
      <button><Sparkles size={16} /><span>Ask Linear</span></button>
      <button><LayoutDashboard size={16} /><span>My issues</span></button>
      <button><CircleDot size={16} /><span>Inbox</span></button>
    </nav>
    <div className="nav-section">
      <div className="nav-label"><span>Workspace</span><MoreHorizontal size={14} /></div>
      <button className={activeView === 'initiatives' ? 'active' : ''} onClick={() => onNavigate('initiatives')}><Activity size={16} />Initiatives</button>
      <button className={activeView === 'tree' ? 'active' : ''} onClick={() => onNavigate('tree')}><Goal size={16} />Initiative tree</button>
      <button><Box size={16} />Projects</button>
      <button><Users size={16} />Teams</button>
    </div>
    <div className="nav-section teams">
      <div className="nav-label"><span>Live data</span></div>
      <button><i className="team-icon green">✓</i>Linear connected</button>
    </div>
    <div className="sidebar-bottom"><button onClick={onForgetToken}><Link2 size={16} />Forget token</button><button className="avatar">{initials}</button></div>
  </aside>
}

function InitiativesScreen({ data, selectedIds, onToggle, onViewTree }) {
  const [search, setSearch] = useState('')
  const [health, setHealth] = useState('all')
  const initiatives = data.rootIds
    .map(id => data.initiatives.find(item => item.id === id))
    .filter(Boolean)
    .filter(item => !search || `${item.name} ${item.owner} ${item.description || ''}`.toLowerCase().includes(search.toLowerCase()))
    .filter(item => health === 'all' || item.health === health)
    .sort((a, b) => a.name.localeCompare(b.name))
  return <main className="main initiatives-main">
    <header className="topbar"><div className="breadcrumbs"><span>{data.workspace}</span><ChevronRight size={13} /><b>Initiatives</b></div><div className="top-actions"><button><Settings2 size={16} /></button><button className="share" onClick={onViewTree}>View selected tree</button></div></header>
    <section className="page-heading initiatives-heading"><div><div className="title-row"><h1>Initiatives</h1><span className="live"><i /> LIVE</span></div><p>Select the initiatives you want to compare on the tree canvas.</p></div><div className="selection-summary"><strong>{selectedIds.length}</strong><span>selected</span></div></section>
    <section className="initiatives-toolbar">
      <div className="search-box initiative-search"><Search size={15} /><input value={search} onChange={event => setSearch(event.target.value)} placeholder="Search initiatives…" />{search && <button onClick={() => setSearch('')}><X size={13} /></button>}</div>
      <div className="health-chips"><button className={health === 'all' ? 'selected' : ''} onClick={() => setHealth('all')}>All</button>{Object.entries(healthMeta).map(([key, meta]) => <button key={key} className={health === key ? 'selected' : ''} onClick={() => setHealth(key)}><i style={{ background: meta.color }} />{meta.label}</button>)}</div>
      <span className="initiative-result-count">{initiatives.length} initiatives</span>
    </section>
    <div className="initiatives-scroll">
      <div className="initiatives-grid">
        {initiatives.map(item => {
          const selected = selectedIds.includes(item.id)
          return <article key={item.id} className={`initiative-grid-card ${selected ? 'selected' : ''}`} onClick={() => onToggle(item.id)}>
            <div className="initiative-card-top"><span className="initiative-card-icon" style={{ '--initiative-color': item.color || '#6961ca' }}><Flag size={15} /></span><Status health={item.health} /><span className="grid-toggle">{selected && <Check size={13} />}</span></div>
            <h3>{item.name}</h3>
            <p>{item.description || 'No description has been added in Linear.'}</p>
            <div className="initiative-grid-progress"><div><span>Progress</span><strong>{item.progress}%</strong></div><Progress value={item.progress} color={item.color || healthMeta[item.health]?.color} /></div>
            <div className="initiative-card-footer"><span className="person"><i>{item.owner.slice(0, 2).toUpperCase()}</i>{item.owner}</span><span><Box size={12} />{item.projectIds.length} projects</span><a href={item.url} target="_blank" rel="noreferrer" onClick={event => event.stopPropagation()}><ArrowUpRight size={13} /></a></div>
          </article>
        })}
      </div>
      {!initiatives.length && <div className="no-initiatives"><Search size={22} /><h3>No initiatives found</h3><p>Try another search or health filter.</p></div>}
    </div>
    <div className="selection-dock"><div className="selection-stack">{selectedIds.slice(0, 5).map((id, index) => <span key={id} style={{ zIndex: 6 - index }}>{data.initiatives.find(item => item.id === id)?.name.slice(0, 1)}</span>)}{selectedIds.length > 5 && <span>+{selectedIds.length - 5}</span>}</div><div><strong>{selectedIds.length} initiatives selected</strong><p>Selection is shared with the tree view</p></div><button onClick={onViewTree}>View tree <ChevronRight size={14} /></button></div>
  </main>
}

function NodeCard({ kind, item, pos, selected, dimmed, collapsed, onToggle, onSelect, orientation }) {
  const nodeClass = kind === 'root' ? 'goal' : kind === 'initiative' ? 'kr' : kind === 'project' ? 'kpi' : 'project'
  const CollapseIcon = orientation === 'vertical' ? (collapsed ? ChevronDown : ChevronUp) : (collapsed ? ChevronRight : ChevronLeft)
  return <article className={`tree-node ${nodeClass} ${orientation === 'vertical' ? 'vertical-node' : ''} ${selected ? 'selected' : ''} ${dimmed ? 'dimmed' : ''}`} style={{ left: pos.x, top: pos.y }} onClick={() => onSelect({ kind, item })}>
    {kind === 'root' && <>
      <div className="node-eyebrow"><span className="goal-glyph"><Target size={14} /></span>ROOT INITIATIVE <Status health={item.health} compact /></div>
      <h2>{item.name}</h2>
      <div className="goal-stats"><div><strong>{item.progress}%</strong><span>project progress</span></div><div className="goal-progress"><Progress value={item.progress} /></div></div>
      <div className="node-footer"><Status health={item.health} /><span><Building2 size={13} /> {item.status}</span></div>
    </>}
    {kind === 'initiative' && <>
      <div className="node-eyebrow"><span className="kr-icon"><Flag size={13} /></span>INITIATIVE <Status health={item.health} compact /></div>
      <h3>{item.name}</h3>
      <div className="kr-progress"><Progress value={item.progress} color={healthMeta[item.health]?.color} /><strong>{item.progress}%</strong></div>
      <div className="node-footer"><span className="person"><i>{item.owner.slice(0,2).toUpperCase()}</i>{item.owner}</span><span>{item.projectIds.length} projects</span></div>
      <button className="collapse-btn" onClick={event => { event.stopPropagation(); onToggle(item.nodeId || item.id) }}><CollapseIcon size={15} /></button>
    </>}
    {kind === 'project' && <>
      <div className="node-eyebrow"><span className="kpi-icon"><Activity size={13} /></span>PROJECT {item.groupLabel && <span className="project-group-tag">{item.groupLabel}</span>}<Status health={item.health} compact /></div>
      <h3>{item.name}</h3>
      <div className="metric-row"><strong>{item.progress}%</strong><span>{item.issueIds.length} issues</span><Sparkline project={item} /></div>
      <div className="node-footer"><Status health={item.health} /><span>{collapsed ? 'Expand issues' : `${item.issueIds.length} loaded`}</span></div>
      <button className="collapse-btn" onClick={event => { event.stopPropagation(); onToggle(item.nodeId || item.id) }}><CollapseIcon size={15} /></button>
    </>}
    {kind === 'issue' && <>
      <div className="project-top"><span className="project-icon"><Diamond size={12} /></span><b>{item.identifier}</b><Status health={item.health} compact /></div>
      <h3>{item.title}</h3>
      <div className="project-meta"><div className="mini-avatar">{item.ownerInitials}</div><span className="issue-state">{item.state}</span><strong>{item.team}</strong></div>
    </>}
  </article>
}

function Inspector({ selection, onClose }) {
  if (!selection) return null
  const { kind, item } = selection
  const title = item.name || item.title
  return <aside className="inspector">
    <div className="inspector-header"><span>Linear {kind}</span><button onClick={onClose}><X size={17} /></button></div>
    <div className="inspector-body">
      <div className={`inspector-glyph ${kind}`}><Target size={18} /></div>
      <h2>{title}</h2>
      {item.identifier && <p className="issue-key">{item.identifier}</p>}
      <Status health={item.health} />
      <div className="detail-grid">
        <span>Status</span><strong>{item.state || item.status || healthMeta[item.health]?.label}</strong>
        <span>Owner</span><strong>{item.owner || 'Unassigned'}</strong>
        <span>Progress</span><strong>{item.progress !== undefined ? `${item.progress}%` : '—'}</strong>
        <span>Last updated</span><strong>{new Date(item.updatedAt).toLocaleDateString()}</strong>
      </div>
      {item.description && <div className="inspector-section"><h4>Description</h4><p>{item.description}</p></div>}
      <a className="open-linear" href={item.url} target="_blank" rel="noreferrer">Open in Linear <ArrowUpRight size={14} /></a>
    </div>
  </aside>
}

function EmptyState({ error, onConnect }) {
  const missing = error?.code === 'NOT_CONFIGURED'
  const [token, setToken] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const submit = async event => {
    event.preventDefault()
    if (!token.trim()) return
    setSubmitting(true)
    await onConnect(token.trim())
    setSubmitting(false)
  }
  return <div className="connection-state">
    <div className="connection-icon">{missing ? <Link2 size={24} /> : <X size={24} />}</div>
    <h1>{missing ? 'Connect your Linear workspace' : 'Couldn’t load Linear data'}</h1>
    <p>{missing ? 'Paste your personal Linear API key. It is saved only in this browser and sent directly to Linear.' : error?.message}</p>
    <form className="token-form" onSubmit={submit}>
      <input type="password" value={token} onChange={event => setToken(event.target.value)} placeholder="lin_api_…" autoComplete="off" spellCheck="false" aria-label="Linear personal API key" />
      <button disabled={submitting || !token.trim()}>{submitting ? <LoaderCircle size={14} className="spin" /> : <Link2 size={14} />}{submitting ? 'Connecting…' : missing ? 'Connect Linear' : 'Try another token'}</button>
    </form>
    <p className="token-notice">Use a read-only workspace token when possible. Anyone who can run JavaScript on this page could access browser storage, so OAuth is safer for broad public use.</p>
  </div>
}

function ShelfSummary({ shelf, pos, orientation, onExpand }) {
  return <button className={`shelf-summary ${orientation === 'vertical' ? 'vertical-summary' : ''}`} style={{ left: pos.x, top: pos.y }} onClick={() => onExpand(shelf.root.id)}>
    <div className="shelf-summary-top"><span><Box size={14} /></span><b>PROJECT SHELF</b><ChevronRight size={14} /></div>
    <strong>{shelf.projects.length} projects</strong>
    <div className="shelf-health">{Object.entries(shelf.counts).filter(([, count]) => count).map(([health, count]) => <span key={health}><i style={{ background: healthMeta[health].color }} />{count} {healthMeta[health].label.toLowerCase()}</span>)}</div>
    <div className="shelf-summary-footer">{shelf.groupingLabel === 'None' ? 'Alphabetical' : `Grouped by ${shelf.groupingLabel.toLowerCase()}`} · click to show cards</div>
  </button>
}

export default function LiveApp() {
  const [apiToken, setApiToken] = useState(readStoredToken)
  const [data, setData] = useState(null)
  const [view, setView] = useState('tree')
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(true)
  const [rootIds, setRootIds] = useState(readStoredSelection)
  const [orientation, setOrientation] = useState('horizontal')
  const [rootPickerOpen, setRootPickerOpen] = useState(false)
  const [initiativeQuery, setInitiativeQuery] = useState('')
  const [collapsedInitiatives, setCollapsedInitiatives] = useState(new Set())
  const [collapsedProjects, setCollapsedProjects] = useState(new Set())
  const [selection, setSelection] = useState(null)
  const [query, setQuery] = useState('')
  const [healthFilter, setHealthFilter] = useState('all')
  const [filterOpen, setFilterOpen] = useState(false)
  const [zoom, setZoom] = useState(1)
  const [projectGrouping, setProjectGrouping] = useState(readStoredGrouping)
  const [expandedShelves, setExpandedShelves] = useState(new Set())
  const [viewportWindow, setViewportWindow] = useState(null)
  const viewportRef = useRef(null)
  const gestureStartZoomRef = useRef(1)

  async function load(token = apiToken) {
    if (!token) {
      setLoading(false)
      setError({ code: 'NOT_CONFIGURED', message: 'Connect a Linear workspace.' })
      return false
    }
    setLoading(true); setError(null)
    try {
      const body = await loadLinearTree(token)
      setData(body)
      const roots = body.rootIds.map(id => body.initiatives.find(item => item.id === id)).filter(Boolean)
      const initial = roots.sort((a, b) => b.projectIds.length - a.projectIds.length)[0]
      setRootIds(current => {
        const valid = current.filter(id => body.rootIds.includes(id))
        return valid.length ? valid : initial ? [initial.id] : []
      })
      setCollapsedProjects(new Set(body.projects.map(item => item.id)))
      setApiToken(token)
      try { window.localStorage.setItem(TOKEN_STORAGE_KEY, token) } catch { /* Storage can be unavailable in restricted browser contexts. */ }
      return true
    } catch (caught) {
      setData(null)
      setError({ code: caught.code || 'LINEAR_API_ERROR', message: caught.message || 'Unable to load Linear data.' })
      return false
    } finally { setLoading(false) }
  }
  useEffect(() => { load(apiToken) }, [])
  useEffect(() => {
    if (!rootIds.length) return
    try { window.localStorage.setItem(SELECTION_STORAGE_KEY, JSON.stringify(rootIds)) } catch { /* Storage can be unavailable in restricted browser contexts. */ }
  }, [rootIds])
  useEffect(() => {
    try { window.localStorage.setItem(GROUPING_STORAGE_KEY, projectGrouping) } catch { /* Storage can be unavailable in restricted browser contexts. */ }
  }, [projectGrouping])

  const setCanvasZoom = (nextZoom, anchor = null) => {
    const viewport = viewportRef.current
    const clamped = Math.max(.4, Math.min(1.6, Number(nextZoom.toFixed(2))))
    if (!viewport || !anchor) { setZoom(clamped); return }
    const rect = viewport.getBoundingClientRect()
    const clientX = Number.isFinite(anchor.clientX) ? anchor.clientX : rect.left + rect.width / 2
    const clientY = Number.isFinite(anchor.clientY) ? anchor.clientY : rect.top + rect.height / 2
    const offsetX = clientX - rect.left
    const offsetY = clientY - rect.top
    const canvasX = (viewport.scrollLeft + offsetX) / zoom
    const canvasY = (viewport.scrollTop + offsetY) / zoom
    setZoom(clamped)
    window.requestAnimationFrame(() => {
      viewport.scrollLeft = canvasX * clamped - offsetX
      viewport.scrollTop = canvasY * clamped - offsetY
    })
  }

  const tree = useMemo(() => {
    if (!data || !rootIds.length) return null
    const roots = rootIds.map(id => data.initiatives.find(item => item.id === id)).filter(Boolean)
    if (!roots.length) return null
    const selectedSet = new Set(rootIds)
    const branches = roots.flatMap(root => {
      const children = data.initiatives.filter(item => item.parentId === root.id && !selectedSet.has(item.id))
      const items = children.length
        ? children.map(item => ({ ...item, id: `branch:${root.id}:${item.id}`, sourceId: item.id, rootId: root.id }))
        : [{ ...root, id: `branch:${root.id}`, sourceId: root.id, rootId: root.id }]
      if (children.length && root.projectIds.length) items.push({ ...root, id: `direct:${root.id}`, name: `${root.name} · Direct projects`, sourceId: root.id, rootId: root.id })
      return items
    })
    const branchProjectIds = new Set(branches.flatMap(item => item.projectIds))
    const projects = data.projects.filter(item => branchProjectIds.has(item.id))
    const openBranchSources = new Set(branches.filter(item => !collapsedInitiatives.has(item.id)).map(item => item.sourceId))
    const rootRank = new Map(roots.map((root, index) => [root.id, index]))
    const projectRoot = project => branches
      .filter(branch => project.initiativeIds.includes(branch.sourceId))
      .sort((a, b) => rootRank.get(a.rootId) - rootRank.get(b.rootId))[0]?.rootId
    const healthOrder = { blocked: 0, atrisk: 1, ontrack: 2, planned: 3 }
    const groupingLabel = projectGrouping === 'health' ? 'Health' : projectGrouping === 'owner' ? 'Project lead' : 'None'
    const groupValue = project => projectGrouping === 'health' ? healthMeta[project.health]?.label || 'No update' : projectGrouping === 'owner' ? project.owner || 'Unassigned' : ''
    const compareWithinRoot = (a, b) => {
      if (projectGrouping === 'health') return healthOrder[a.health] - healthOrder[b.health] || a.name.localeCompare(b.name)
      if (projectGrouping === 'owner') return groupValue(a).localeCompare(groupValue(b)) || a.name.localeCompare(b.name)
      return a.name.localeCompare(b.name)
    }
    // allProjects is the stable geometry model. visibleProjects only controls rendering.
    const allProjects = [...projects]
      .sort((a, b) => (rootRank.get(projectRoot(a)) ?? 999) - (rootRank.get(projectRoot(b)) ?? 999) || compareWithinRoot(a, b))
      .map(project => ({ ...project, groupLabel: projectGrouping === 'none' ? null : groupValue(project) }))
    const maxColumns = 3, projectColumnStep = 300, projectRowStep = 138
    const rootHasOpenIssues = rootId => allProjects.some(project => projectRoot(project) === rootId && !collapsedProjects.has(project.id))
    const shelfDetailed = rootId => zoom >= .72 || expandedShelves.has(rootId) || rootHasOpenIssues(rootId)
    const columnCountForRoot = rootId => {
      if (!shelfDetailed(rootId)) return 1
      const count = allProjects.filter(project => projectRoot(project) === rootId).length
      return Math.min(maxColumns, Math.max(1, Math.ceil(Math.sqrt(count || 1))))
    }
    const visibleProjects = allProjects.filter(project => shelfDetailed(projectRoot(project)) && project.initiativeIds.some(id => openBranchSources.has(id)))
    const visibleProjectIds = new Set(visibleProjects.filter(project => !collapsedProjects.has(project.id)).map(project => project.id))
    const issues = data.issues.filter(item => visibleProjectIds.has(item.projectId))
    const projectBase = new Map(), issueBase = new Map(), branchBase = new Map(), rootBase = new Map()
    const shelves = [], rails = [], laneModels = []
    const widestActiveShelf = Math.max(1, ...roots.map(root => columnCountForRoot(root.id)))
    const projectStartX = 740, issueStartX = projectStartX + widestActiveShelf * projectColumnStep + 45
    let laneCursor = 55
    roots.forEach((root, rootIndex) => {
      const rootBranches = branches.filter(branch => branch.rootId === root.id)
      const rootOpen = rootBranches.some(branch => !collapsedInitiatives.has(branch.id))
      const rootProjects = allProjects.filter(project => projectRoot(project) === root.id)
      const rootProjectIds = new Set(rootProjects.map(project => project.id))
      const rootIssues = issues.filter(issue => rootProjectIds.has(issue.projectId))
      const detailed = shelfDetailed(root.id)
      const columns = columnCountForRoot(root.id)
      const rows = detailed ? Math.max(1, Math.ceil(rootProjects.length / columns)) : 1
      const projectHeight = rows * projectRowStep
      const issueHeight = Math.max(1, rootIssues.length) * 122
      const branchHeight = Math.max(1, rootBranches.length) * 150
      const laneHeight = Math.max(185, detailed ? projectHeight : 150, issueHeight, branchHeight) + 40
      const laneStart = laneCursor
      rootProjects.forEach((project, index) => projectBase.set(project.id, {
        x: projectStartX + (index % columns) * projectColumnStep,
        y: laneStart + Math.floor(index / columns) * projectRowStep,
      }))
      rootIssues.forEach((issue, index) => issueBase.set(issue.id, { x: issueStartX, y: laneStart + index * 122 }))
      rootBranches.forEach((branch, index) => branchBase.set(branch.id, { x: 375, y: laneStart + index * 150 + Math.max(0, (laneHeight - branchHeight) / 2) }))
      rootBase.set(root.id, { x: 34, y: laneStart + Math.max(0, (laneHeight - 166) / 2) })
      const counts = rootProjects.reduce((acc, project) => ({ ...acc, [project.health]: (acc[project.health] || 0) + 1 }), { ontrack: 0, atrisk: 0, blocked: 0, planned: 0 })
      shelves.push({ root, projects: rootProjects, counts, groupingLabel, detailed, visible: rootOpen, columns, rows, pos: { x: projectStartX, y: laneStart }, width: columns * projectColumnStep - 15, height: detailed ? projectHeight - 12 : 126 })
      if (detailed && rootProjects.length) rails.push({ rootId: root.id, visible: rootOpen, x: projectStartX - 30, y1: laneStart + 18, y2: laneStart + laneHeight - 18 })
      laneModels.push({ id: root.id, index: rootIndex, start: laneStart - 28, size: laneHeight + 16 })
      laneCursor += laneHeight + 72
    })
    const baseHeight = Math.max(680, laneCursor)
    const baseWidth = issueStartX + 330
    const orient = position => orientation === 'vertical' ? { x: position.y, y: position.x } : position
    const lanes = laneModels.map(lane => orientation === 'vertical'
      ? { id: lane.id, x: lane.start, y: 4, width: lane.size, height: baseWidth - 12, index: lane.index }
      : { id: lane.id, x: 4, y: lane.start, width: baseWidth - 12, height: lane.size, index: lane.index })
    return {
      roots, branches, projects: visibleProjects, projectCount: allProjects.length, issues, lanes, shelves, issueLayerOffset: issueStartX,
      rails: rails.map(rail => ({ ...rail, a: orient({ x: rail.x, y: rail.y1 }), b: orient({ x: rail.x, y: rail.y2 }) })),
      rootPos: new Map(roots.map(item => [item.id, orient(rootBase.get(item.id))])),
      branchPos: new Map(branches.map(item => [item.id, orient(branchBase.get(item.id))])),
      projectPos: new Map(allProjects.map(item => [item.id, orient(projectBase.get(item.id))])),
      issuePos: new Map(issues.map(item => [item.id, orient(issueBase.get(item.id))])),
      shelfPos: new Map(shelves.map(shelf => [shelf.root.id, orient(shelf.pos)])),
      width: orientation === 'vertical' ? Math.max(1450, baseHeight) : baseWidth,
      height: orientation === 'vertical' ? baseWidth : baseHeight,
    }
  }, [data, rootIds, collapsedInitiatives, collapsedProjects, orientation, zoom, expandedShelves, projectGrouping])

  const updateViewportWindow = () => {
    const viewport = viewportRef.current
    if (!viewport) return
    setViewportWindow({
      left: viewport.scrollLeft / zoom - 450,
      top: viewport.scrollTop / zoom - 450,
      right: (viewport.scrollLeft + viewport.clientWidth) / zoom + 450,
      bottom: (viewport.scrollTop + viewport.clientHeight) / zoom + 450,
    })
  }
  useEffect(() => {
    const frame = window.requestAnimationFrame(updateViewportWindow)
    return () => window.cancelAnimationFrame(frame)
  }, [zoom, orientation, rootIds, view, tree?.width, tree?.height])
  useEffect(() => {
    const viewport = viewportRef.current
    if (!viewport || view !== 'tree') return
    const wheel = event => {
      if (!event.ctrlKey && !event.metaKey) return
      event.preventDefault()
      event.stopPropagation()
      setCanvasZoom(zoom * Math.exp(-event.deltaY * .003), event)
    }
    const gestureStart = event => { event.preventDefault(); gestureStartZoomRef.current = zoom }
    const gestureChange = event => { event.preventDefault(); event.stopPropagation(); setCanvasZoom(gestureStartZoomRef.current * event.scale, event) }
    const gestureEnd = event => event.preventDefault()
    viewport.addEventListener('wheel', wheel, { passive: false })
    viewport.addEventListener('gesturestart', gestureStart, { passive: false })
    viewport.addEventListener('gesturechange', gestureChange, { passive: false })
    viewport.addEventListener('gestureend', gestureEnd, { passive: false })
    return () => {
      viewport.removeEventListener('wheel', wheel)
      viewport.removeEventListener('gesturestart', gestureStart)
      viewport.removeEventListener('gesturechange', gestureChange)
      viewport.removeEventListener('gestureend', gestureEnd)
    }
  }, [zoom, view, tree?.width])

  if (loading && !data) return <div className="full-loading"><LoaderCircle size={26} /><span>Loading your Linear workspace…</span></div>
  if (error || !data || !tree) return <EmptyState error={error} onConnect={load} />

  const toggle = (setter, id) => setter(previous => { const next = new Set(previous); next.has(id) ? next.delete(id) : next.add(id); return next })
  const dimmed = item => {
    const text = `${item.name || item.title || ''} ${item.identifier || ''} ${item.owner || ''}`.toLowerCase()
    return (query && !text.includes(query.toLowerCase())) || (healthFilter !== 'all' && item.health !== healthFilter)
  }
  const nodeHeights = { root: 166, initiative: 140, project: 126, issue: 108 }
  const makeEdge = (fromPos, toPos, fromKind, toKind, health, shared = false) => {
    if (orientation === 'vertical') return {
      from: { x: fromPos.x + 142.5, y: fromPos.y + nodeHeights[fromKind] },
      to: { x: toPos.x + 142.5, y: toPos.y }, health, shared,
    }
    return {
      from: { x: fromPos.x + 285, y: fromPos.y + nodeHeights[fromKind] / 2 },
      to: { x: toPos.x, y: toPos.y + nodeHeights[toKind] / 2 }, health, shared,
    }
  }
  const edges = []
  tree.branches.forEach(branch => {
    edges.push(makeEdge(tree.rootPos.get(branch.rootId), tree.branchPos.get(branch.id), 'root', 'initiative', branch.health))
    if (collapsedInitiatives.has(branch.id)) return
    const rail = tree.rails.find(item => item.rootId === branch.rootId)
    const shelf = tree.shelves.find(item => item.root.id === branch.rootId)
    if (!rail && shelf && !shelf.detailed) {
      edges.push(makeEdge(tree.branchPos.get(branch.id), tree.shelfPos.get(branch.rootId), 'initiative', 'project', branch.health))
      return
    }
    if (!rail) return
    const branchPos = tree.branchPos.get(branch.id)
    if (orientation === 'vertical') {
      const x = branchPos.x + 142.5
      edges.push({ from: { x, y: branchPos.y + 140 }, to: { x, y: rail.a.y }, health: branch.health })
    } else {
      const y = branchPos.y + 70
      edges.push({ from: { x: branchPos.x + 285, y }, to: { x: rail.a.x, y }, health: branch.health })
    }
    tree.projects.filter(project => project.initiativeIds.includes(branch.sourceId)).forEach(project => {
      const pos = tree.projectPos.get(project.id)
      edges.push(orientation === 'vertical'
        ? { from: { x: pos.x + 142.5, y: rail.a.y }, to: { x: pos.x + 142.5, y: pos.y }, health: project.health, shared: project.initiativeIds.length > 1 }
        : { from: { x: rail.a.x, y: pos.y + 63 }, to: { x: pos.x, y: pos.y + 63 }, health: project.health, shared: project.initiativeIds.length > 1 })
    })
  })
  tree.issues.forEach(issue => edges.push(makeEdge(tree.projectPos.get(issue.projectId), tree.issuePos.get(issue.id), 'project', 'issue', issue.health)))

  const rootOptions = data.rootIds.map(id => data.initiatives.find(item => item.id === id)).filter(Boolean).sort((a,b) => a.name.localeCompare(b.name))
  const filteredRootOptions = rootOptions.filter(item => item.name.toLowerCase().includes(initiativeQuery.toLowerCase()))
  const toggleRoot = id => {
    setRootIds(previous => previous.includes(id) ? (previous.length === 1 ? previous : previous.filter(item => item !== id)) : [...previous, id])
    setSelection(null)
  }
  const isCardVisible = (pos, height = 126) => !viewportWindow || (pos.x + 285 >= viewportWindow.left && pos.x <= viewportWindow.right && pos.y + height >= viewportWindow.top && pos.y <= viewportWindow.bottom)
  return <div className="app-shell">
    <Sidebar workspace={data.workspace} viewer={data.viewer} activeView={view} onNavigate={setView} onForgetToken={() => {
      try { window.localStorage.removeItem(TOKEN_STORAGE_KEY) } catch { /* Storage can be unavailable in restricted browser contexts. */ }
      setApiToken(''); setData(null); setSelection(null); setError({ code: 'NOT_CONFIGURED', message: 'Connect a Linear workspace.' })
    }} />
    {view === 'initiatives' ? <InitiativesScreen data={data} selectedIds={rootIds} onToggle={toggleRoot} onViewTree={() => setView('tree')} /> : <>
    <main className="main">
      <header className="topbar"><div className="breadcrumbs"><span>{data.workspace}</span><ChevronRight size={13} /><span>Initiatives</span><ChevronRight size={13} /><b>{tree.roots.length === 1 ? tree.roots[0].name : `${tree.roots.length} initiatives`}</b></div><div className="top-actions"><button><Focus size={16} /></button><button><Settings2 size={16} /></button>{tree.roots.length === 1 && <button className="share" onClick={() => window.open(tree.roots[0].url, '_blank')}>Open in Linear</button>}</div></header>
      <section className="page-heading"><div><div className="title-row"><h1>Initiative tree</h1><span className="live"><i /> LIVE</span></div><p>Trace strategic initiatives into their projects and active issues.</p></div><div className="sync"><Check size={13} /> Synced {new Date(data.syncedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}{data.truncated && <span className="truncated"> · Large workspace, newest records shown</span>}</div></section>
      <section className="toolbar">
        <div className="root-picker-wrap"><button className="root-picker-button" onClick={() => setRootPickerOpen(value => !value)}><Goal size={14} /><span>{rootIds.length === 1 ? tree.roots[0].name : `${rootIds.length} initiatives`}</span><span className="selection-count">{rootIds.length}</span><ChevronDown size={13} /></button>{rootPickerOpen && <div className="root-picker-menu"><div className="root-picker-search"><Search size={14} /><input value={initiativeQuery} onChange={event => setInitiativeQuery(event.target.value)} placeholder="Find initiatives…" /></div><div className="root-picker-actions"><button onClick={() => setRootIds(rootOptions.slice(0, 8).map(item => item.id))}>Select first 8</button><button onClick={() => setRootIds([rootOptions[0].id])}>Clear</button></div><div className="root-picker-list">{filteredRootOptions.map(item => <label key={item.id}><input type="checkbox" checked={rootIds.includes(item.id)} onChange={() => toggleRoot(item.id)} /><span className="custom-check">{rootIds.includes(item.id) && <Check size={11} />}</span><span title={item.name}>{item.name}</span><small>{item.projectIds.length}</small></label>)}</div><div className="root-picker-footer">{rootIds.length} selected · Shared projects are shown once</div></div>}</div>
        <div className="orientation-toggle" aria-label="Tree orientation"><button className={orientation === 'horizontal' ? 'selected' : ''} onClick={() => setOrientation('horizontal')} title="Left to right"><Columns3 size={14} /></button><button className={orientation === 'vertical' ? 'selected' : ''} onClick={() => setOrientation('vertical')} title="Top to bottom"><Rows3 size={14} /></button></div>
        <label className="grouping-control"><Layers3 size={14} /><span>Group</span><select value={projectGrouping} onChange={event => setProjectGrouping(event.target.value)}><option value="health">Health</option><option value="owner">Project lead</option><option value="none">None</option></select><ChevronDown size={12} /></label>
        <div className="search-box"><Search size={15} /><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Search this tree…" />{query && <button onClick={() => setQuery('')}><X size={13} /></button>}</div>
        <div className="filter-wrap"><button className={healthFilter !== 'all' ? 'active-filter' : ''} onClick={() => setFilterOpen(!filterOpen)}><Filter size={14} /> Health<ChevronDown size={13} /></button>{filterOpen && <div className="filter-menu">{['all', ...Object.keys(healthMeta)].map(health => <button key={health} onClick={() => { setHealthFilter(health); setFilterOpen(false) }} className={healthFilter === health ? 'selected' : ''}>{health === 'all' ? <Crosshair size={14} /> : <Status health={health} compact />}{health === 'all' ? 'All health' : healthMeta[health].label}{healthFilter === health && <Check size={13} />}</button>)}</div>}</div>
        <button onClick={() => { setCollapsedInitiatives(new Set()); setCollapsedProjects(new Set()) }}><Maximize2 size={14} /> Expand all</button>
        <button onClick={() => setCollapsedProjects(new Set(data.projects.map(item => item.id)))}><Minus size={14} /> Hide issues</button>
        <button onClick={() => load(apiToken)} disabled={loading}><RefreshCw size={14} className={loading ? 'spin' : ''} /> Refresh</button>
      </section>
      <div className="canvas-viewport" ref={viewportRef} onScroll={updateViewportWindow}>
        <div className="canvas" style={{ width: tree.width * zoom, height: tree.height * zoom }}><div className="canvas-scale" style={{ width: tree.width, height: tree.height, transform: `scale(${zoom})` }}>
          {orientation === 'horizontal' ? <><div className="column-label" style={{ left: 34 }}>ROOT INITIATIVES <span>{tree.roots.length}</span></div><div className="column-label" style={{ left: 375 }}>INITIATIVES <span>{tree.branches.length}</span></div><div className="column-label" style={{ left: 740 }}>PROJECT SHELVES <span>{tree.projectCount}</span></div><div className="column-label" style={{ left: tree.issueLayerOffset }}>ISSUES <span>{tree.issues.length}</span></div></> : <><div className="column-label row-label" style={{ top: 13 }}>ROOT INITIATIVES <span>{tree.roots.length}</span></div><div className="column-label row-label" style={{ top: 354 }}>INITIATIVES <span>{tree.branches.length}</span></div><div className="column-label row-label" style={{ top: 719 }}>PROJECT SHELVES <span>{tree.projectCount}</span></div><div className="column-label row-label" style={{ top: tree.issueLayerOffset - 21 }}>ISSUES <span>{tree.issues.length}</span></div></>}
          {tree.lanes.map(lane => <div key={lane.id} className={`initiative-lane lane-${lane.index % 2}`} style={{ left: lane.x, top: lane.y, width: lane.width, height: lane.height }} />)}
          {tree.shelves.filter(shelf => shelf.detailed && shelf.visible).map(shelf => { const pos = tree.shelfPos.get(shelf.root.id); return <div key={shelf.root.id} className="project-shelf-frame" style={{ left: pos.x - 14, top: pos.y - 16, width: orientation === 'vertical' ? shelf.height + 28 : shelf.width + 28, height: orientation === 'vertical' ? shelf.width + 28 : shelf.height + 28 }}><span>{shelf.projects.length} projects · {shelf.groupingLabel === 'None' ? 'alphabetical' : `grouped by ${shelf.groupingLabel.toLowerCase()}`}</span></div> })}
          <svg className="connectors" width={tree.width} height={tree.height}>{tree.rails.filter(rail => rail.visible).map(rail => <path key={`rail:${rail.rootId}`} d={`M ${rail.a.x} ${rail.a.y} L ${rail.b.x} ${rail.b.y}`} className="project-rail" />)}{edges.map((edge, index) => { const path = orientation === 'vertical' ? (() => { const bend = edge.from.y + (edge.to.y - edge.from.y) * .48; return `M ${edge.from.x} ${edge.from.y} C ${edge.from.x} ${bend}, ${edge.to.x} ${bend}, ${edge.to.x} ${edge.to.y}` })() : (() => { const bend = edge.from.x + (edge.to.x - edge.from.x) * .48; return `M ${edge.from.x} ${edge.from.y} C ${bend} ${edge.from.y}, ${bend} ${edge.to.y}, ${edge.to.x} ${edge.to.y}` })(); return <path key={index} d={path} className={edge.shared ? 'shared' : ''} style={{ '--edge': healthMeta[edge.health]?.color }} /> })}</svg>
          {tree.shelves.filter(shelf => !shelf.detailed && shelf.visible).map(shelf => <ShelfSummary key={shelf.root.id} shelf={shelf} pos={tree.shelfPos.get(shelf.root.id)} orientation={orientation} onExpand={id => setExpandedShelves(previous => new Set(previous).add(id))} />)}
          {tree.roots.map(item => <NodeCard key={item.id} kind="root" item={item} pos={tree.rootPos.get(item.id)} orientation={orientation} onSelect={setSelection} selected={selection?.item.id === item.id} dimmed={dimmed(item)} />)}
          {tree.branches.map(item => <NodeCard key={item.id} kind="initiative" item={item} pos={tree.branchPos.get(item.id)} orientation={orientation} collapsed={collapsedInitiatives.has(item.id)} onToggle={id => toggle(setCollapsedInitiatives, id)} onSelect={setSelection} selected={selection?.item.id === item.id} dimmed={dimmed(item)} />)}
          {tree.projects.filter(item => isCardVisible(tree.projectPos.get(item.id), 126)).map(item => <NodeCard key={item.id} kind="project" item={item} pos={tree.projectPos.get(item.id)} orientation={orientation} collapsed={collapsedProjects.has(item.id)} onToggle={id => toggle(setCollapsedProjects, id)} onSelect={setSelection} selected={selection?.item.id === item.id} dimmed={dimmed(item)} />)}
          {tree.issues.filter(item => isCardVisible(tree.issuePos.get(item.id), 108)).map(item => <NodeCard key={item.id} kind="issue" item={item} pos={tree.issuePos.get(item.id)} orientation={orientation} onSelect={setSelection} selected={selection?.item.id === item.id} dimmed={dimmed(item)} />)}
        </div></div>
        <div className="zoom-hint">⌘ / Ctrl + scroll to zoom</div><div className="zoom-controls"><button onClick={() => setCanvasZoom(zoom - .1)}><Minus size={14} /></button><button className="zoom-value" onClick={() => setCanvasZoom(1)}>{Math.round(zoom * 100)}%</button><button onClick={() => setCanvasZoom(zoom + .1)}><Plus size={14} /></button><button onClick={() => { setCanvasZoom(1); viewportRef.current?.scrollTo({ left: 0, top: 0, behavior: 'smooth' }) }}><Crosshair size={15} /></button></div>
      </div>
    </main>
    <Inspector selection={selection} onClose={() => setSelection(null)} />
    </>}
  </div>
}
