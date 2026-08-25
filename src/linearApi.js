const LINEAR_ENDPOINT = 'https://api.linear.app/graphql'

const INITIATIVES_QUERY = `
  query GoalTreeInitiatives($after: String) {
    viewer { id name displayName organization { id name } }
    initiatives(first: 50, after: $after, orderBy: updatedAt) {
      nodes {
        id name description url color health status targetDate updatedAt
        owner { id name displayName }
        leadTeam { id name key }
        parentInitiative { id }
      }
      pageInfo { hasNextPage endCursor }
    }
  }
`

const PROJECTS_QUERY = `
  query GoalTreeProjects($after: String, $initiativeIds: [ID!]!) {
    projects(
      first: 50
      after: $after
      orderBy: updatedAt
      filter: { initiatives: { some: { id: { in: $initiativeIds } } } }
    ) {
      nodes {
        id name description url color health progress updatedAt
        completedIssueCountHistory issueCountHistory
        lead { id name displayName }
        initiatives(first: 50) { nodes { id } }
        teams(first: 50) { nodes { id name key } }
      }
      pageInfo { hasNextPage endCursor }
    }
  }
`

const ISSUES_QUERY = `
  query GoalTreeIssues($after: String, $projectIds: [ID!]!) {
    issues(
      first: 100
      after: $after
      orderBy: updatedAt
      filter: { project: { id: { in: $projectIds } } }
    ) {
      nodes {
        id identifier title url priorityLabel updatedAt completedAt canceledAt
        project { id }
        assignee { id name displayName }
        state { id name type color }
        team { id name key }
        cycle { id name number }
      }
      pageInfo { hasNextPage endCursor }
    }
  }
`

function normalizeHealth(health, fallback = 'planned') {
  if (health === 'onTrack') return 'ontrack'
  if (health === 'atRisk') return 'atrisk'
  if (health === 'offTrack') return 'blocked'
  return fallback
}

function issueHealth(issue) {
  if (issue.canceledAt || issue.state?.type === 'canceled') return 'blocked'
  if (issue.state?.type === 'completed' || issue.state?.type === 'started') return 'ontrack'
  return 'planned'
}

function initials(user) {
  const name = user?.displayName || user?.name || 'Unassigned'
  return name.split(/\s+/).slice(0, 2).map(part => part[0]).join('').toUpperCase()
}

function chunks(items, size = 100) {
  const result = []
  for (let index = 0; index < items.length; index += size) result.push(items.slice(index, index + size))
  return result
}

function normalizeWorkspace(viewer, rawInitiatives) {
  const initiatives = rawInitiatives.map(initiative => {
    const leadTeam = initiative.leadTeam ? { id: initiative.leadTeam.id, name: initiative.leadTeam.name, key: initiative.leadTeam.key } : null
    return {
      id: initiative.id,
      name: initiative.name,
      description: initiative.description,
      url: initiative.url,
      color: initiative.color,
      health: normalizeHealth(initiative.health, initiative.status === 'Completed' ? 'ontrack' : 'planned'),
      status: initiative.status,
      targetDate: initiative.targetDate,
      owner: initiative.owner?.displayName || initiative.owner?.name || 'Unassigned',
      parentId: initiative.parentInitiative?.id || null,
      projectIds: [],
      teamIds: leadTeam ? [leadTeam.id] : [],
      teams: leadTeam ? [leadTeam] : [],
      progress: initiative.status === 'Completed' ? 100 : 0,
      updatedAt: initiative.updatedAt,
    }
  })

  const initiativesByParent = new Map()
  for (const initiative of initiatives) {
    const siblings = initiativesByParent.get(initiative.parentId) || []
    siblings.push(initiative)
    initiativesByParent.set(initiative.parentId, siblings)
  }
  const hierarchyTeams = new Map()
  function collectTeams(initiative, visited = new Set()) {
    if (hierarchyTeams.has(initiative.id)) return hierarchyTeams.get(initiative.id)
    if (visited.has(initiative.id)) return initiative.teams
    const nextVisited = new Set(visited).add(initiative.id)
    const teams = [...new Map([
      ...initiative.teams,
      ...(initiativesByParent.get(initiative.id) || []).flatMap(child => collectTeams(child, nextVisited)),
    ].map(team => [team.id, team])).values()]
    hierarchyTeams.set(initiative.id, teams)
    return teams
  }
  for (const initiative of initiatives) {
    initiative.teams = collectTeams(initiative)
    initiative.teamIds = initiative.teams.map(team => team.id)
  }

  return {
    workspace: viewer.organization?.name || 'Linear workspace',
    viewer: viewer.displayName || viewer.name,
    initiatives,
    rootIds: initiatives.filter(item => !item.parentId).map(item => item.id),
    syncedAt: new Date().toISOString(),
  }
}

function normalizeProject(project, issueIds) {
  const teams = project.teams.nodes.map(team => ({ id: team.id, name: team.name, key: team.key }))
  return {
    id: project.id,
    name: project.name,
    description: project.description,
    url: project.url,
    color: project.color,
    health: normalizeHealth(project.health),
    progress: Math.round((project.progress || 0) * 100),
    owner: project.lead?.displayName || project.lead?.name || 'Unassigned',
    ownerInitials: initials(project.lead),
    initiativeIds: project.initiatives.nodes.map(item => item.id),
    teamIds: teams.map(team => team.id),
    teams,
    issueIds,
    issueCountHistory: project.issueCountHistory || [],
    completedIssueCountHistory: project.completedIssueCountHistory || [],
    issuesTruncated: false,
    updatedAt: project.updatedAt,
  }
}

function normalizeIssue(issue) {
  return {
    id: issue.id,
    identifier: issue.identifier,
    title: issue.title,
    url: issue.url,
    projectId: issue.project.id,
    team: issue.team?.name || issue.team?.key || 'Team',
    cycleId: issue.cycle?.id || null,
    cycleName: issue.cycle?.name || (issue.cycle?.number ? `Cycle ${issue.cycle.number}` : 'Unnamed cycle'),
    cycleNumber: issue.cycle?.number || null,
    owner: issue.assignee?.displayName || issue.assignee?.name || 'Unassigned',
    ownerInitials: initials(issue.assignee),
    state: issue.state?.name || 'No status',
    stateType: issue.state?.type || 'backlog',
    health: issueHealth(issue),
    progress: issue.state?.type === 'completed' ? 100 : issue.state?.type === 'started' ? 50 : 0,
    priority: issue.priorityLabel || 'No priority',
    updatedAt: issue.updatedAt,
  }
}

async function execute(token, query, variables, signal) {
  const response = await fetch(LINEAR_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: token },
    body: JSON.stringify({ query, variables }),
    signal,
  })
  const body = await response.json().catch(() => null)
  if (!response.ok || body?.errors?.length) {
    const error = new Error(body?.errors?.map(item => item.message).join('; ') || `Linear API returned ${response.status}`)
    error.code = response.status === 401 ? 'UNAUTHORIZED' : 'LINEAR_API_ERROR'
    throw error
  }
  return body.data
}

export async function loadLinearWorkspace(token, signal) {
  let viewer = null
  let after = null
  const initiatives = []
  do {
    const data = await execute(token, INITIATIVES_QUERY, { after }, signal)
    viewer ||= data.viewer
    initiatives.push(...data.initiatives.nodes)
    after = data.initiatives.pageInfo.hasNextPage ? data.initiatives.pageInfo.endCursor : null
  } while (after)
  return normalizeWorkspace(viewer, initiatives)
}

export async function loadLinearExecution(token, initiativeIds, signal) {
  const rawProjectMap = new Map()
  for (const initiativeIdChunk of chunks(initiativeIds)) {
    let after = null
    do {
      const data = await execute(token, PROJECTS_QUERY, { after, initiativeIds: initiativeIdChunk }, signal)
      for (const project of data.projects.nodes) rawProjectMap.set(project.id, project)
      after = data.projects.pageInfo.hasNextPage ? data.projects.pageInfo.endCursor : null
    } while (after)
  }

  const rawIssueMap = new Map()
  const projectIds = [...rawProjectMap.keys()]
  for (const projectIdChunk of chunks(projectIds)) {
    let after = null
    do {
      const data = await execute(token, ISSUES_QUERY, { after, projectIds: projectIdChunk }, signal)
      for (const issue of data.issues.nodes) rawIssueMap.set(issue.id, issue)
      after = data.issues.pageInfo.hasNextPage ? data.issues.pageInfo.endCursor : null
    } while (after)
  }

  const issues = [...rawIssueMap.values()].map(normalizeIssue)
  const issueIdsByProject = new Map()
  for (const issue of issues) {
    const ids = issueIdsByProject.get(issue.projectId) || []
    ids.push(issue.id)
    issueIdsByProject.set(issue.projectId, ids)
  }
  const projects = [...rawProjectMap.values()].map(project => normalizeProject(project, issueIdsByProject.get(project.id) || []))
  return { projects, issues, initiativeIds, syncedAt: new Date().toISOString(), truncated: false }
}
