const LINEAR_ENDPOINT = 'https://api.linear.app/graphql'

const INITIATIVES_QUERY = `
  query GoalTreeInitiatives($after: String) {
    viewer { id name displayName organization { id name } }
    initiatives(first: 50, after: $after, orderBy: updatedAt) {
      nodes {
        id name description url color health status targetDate updatedAt
        owner { id name displayName }
        parentInitiative { id }
      }
      pageInfo { hasNextPage endCursor }
    }
  }
`

const PROJECTS_QUERY = `
  query GoalTreeProjects($after: String) {
    projects(first: 25, after: $after, orderBy: updatedAt) {
      nodes {
        id name description url color health progress updatedAt
        completedIssueCountHistory issueCountHistory
        lead { id name displayName }
        initiatives(first: 50) { nodes { id } }
        teams(first: 50) { nodes { id name key } }
        issues(first: 25, orderBy: updatedAt) {
          nodes {
            id identifier title url priorityLabel updatedAt completedAt canceledAt
            assignee { id name displayName }
            state { id name type color }
            team { id name key }
          }
          pageInfo { hasNextPage }
        }
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

function normalize(viewer, rawInitiatives, rawProjects, truncated) {
  const projectMap = new Map()
  const issueMap = new Map()

  for (const project of rawProjects) {
    const initiativeIds = new Set(project.initiatives.nodes.map(item => item.id))
    const teams = project.teams.nodes.map(team => ({ id: team.id, name: team.name, key: team.key }))
    const issueIds = []
    for (const issue of project.issues.nodes) {
      issueIds.push(issue.id)
      issueMap.set(issue.id, {
        id: issue.id,
        identifier: issue.identifier,
        title: issue.title,
        url: issue.url,
        projectId: project.id,
        team: issue.team?.name || issue.team?.key || 'Team',
        owner: issue.assignee?.displayName || issue.assignee?.name || 'Unassigned',
        ownerInitials: initials(issue.assignee),
        state: issue.state?.name || 'No status',
        stateType: issue.state?.type || 'backlog',
        health: issueHealth(issue),
        progress: issue.state?.type === 'completed' ? 100 : issue.state?.type === 'started' ? 50 : 0,
        priority: issue.priorityLabel || 'No priority',
        updatedAt: issue.updatedAt,
      })
    }
    projectMap.set(project.id, {
      id: project.id,
      name: project.name,
      description: project.description,
      url: project.url,
      color: project.color,
      health: normalizeHealth(project.health),
      progress: Math.round((project.progress || 0) * 100),
      owner: project.lead?.displayName || project.lead?.name || 'Unassigned',
      ownerInitials: initials(project.lead),
      initiativeIds: [...initiativeIds],
      teamIds: teams.map(team => team.id),
      teams,
      issueIds,
      issueCountHistory: project.issueCountHistory || [],
      completedIssueCountHistory: project.completedIssueCountHistory || [],
      issuesTruncated: project.issues.pageInfo.hasNextPage,
      updatedAt: project.updatedAt,
    })
  }

  const projects = [...projectMap.values()]
  const initiatives = rawInitiatives.map(initiative => {
    const projectIds = projects.filter(project => project.initiativeIds.includes(initiative.id)).map(project => project.id)
    const linkedProjects = projectIds.map(id => projectMap.get(id))
    const teams = [...new Map(linkedProjects.flatMap(project => project.teams).map(team => [team.id, team])).values()]
    const progress = linkedProjects.length
      ? Math.round(linkedProjects.reduce((sum, project) => sum + project.progress, 0) / linkedProjects.length)
      : initiative.status === 'Completed' ? 100 : 0
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
      projectIds,
      teamIds: teams.map(team => team.id),
      teams,
      progress,
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
    projects,
    issues: [...issueMap.values()],
    rootIds: initiatives.filter(item => !item.parentId).map(item => item.id),
    truncated: truncated || projects.some(project => project.issuesTruncated),
    syncedAt: new Date().toISOString(),
  }
}

async function execute(token, query, variables) {
  const response = await fetch(LINEAR_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: token },
    body: JSON.stringify({ query, variables }),
  })
  const body = await response.json().catch(() => null)
  if (!response.ok || body?.errors?.length) {
    const error = new Error(body?.errors?.map(item => item.message).join('; ') || `Linear API returned ${response.status}`)
    error.code = response.status === 401 ? 'UNAUTHORIZED' : 'LINEAR_API_ERROR'
    throw error
  }
  return body.data
}

export async function loadLinearTree(token) {
  let viewer = null
  let after = null
  const initiatives = []
  do {
    const data = await execute(token, INITIATIVES_QUERY, { after })
    viewer ||= data.viewer
    initiatives.push(...data.initiatives.nodes)
    after = data.initiatives.pageInfo.hasNextPage ? data.initiatives.pageInfo.endCursor : null
  } while (after && initiatives.length < 500)

  after = null
  const projects = []
  do {
    const data = await execute(token, PROJECTS_QUERY, { after })
    projects.push(...data.projects.nodes)
    after = data.projects.pageInfo.hasNextPage ? data.projects.pageInfo.endCursor : null
  } while (after && projects.length < 400)

  return normalize(viewer, initiatives, projects, Boolean(after))
}
