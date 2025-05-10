import { getToken } from './auth.js';

const GRAPHQL_ENDPOINT = 'https://learn.reboot01.com/api/graphql-engine/v1/graphql';

// Maximum number of retries for failed requests
const MAX_RETRIES = 2;
const PEOPLE_PAGE_SIZE = 200;
const PEOPLE_LIMIT = 10000;
const ACTIVITY_PAGE_SIZE = 25;

// GraphQL client setup with retry capability
const fetchGraphQL = async (query, variables = {}, retryCount = 0, options = {}) => {
    let retryable = false;
    try {
        // Validate token before making request
        const token = getToken();
        if (!token) {
            throw new Error('Authentication required');
        }

        const response = await fetch(GRAPHQL_ENDPOINT, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            signal: options.signal,
            body: JSON.stringify({
                query,
                variables
            })
        });

        if (!response.ok) {
            retryable = response.status === 429 || response.status >= 500;
            // Handle specific HTTP errors
            if (response.status === 401) {
                throw new Error('Authentication expired');
            }
            throw new Error(`GraphQL request failed: ${response.status}`);
        }

        const data = await response.json();
        
        // Handle GraphQL errors
        if (data.errors?.length) {
            const errorMessage = data.errors.map(e => e.message).join(', ');
            throw new Error(`GraphQL errors: ${errorMessage}`);
        }

        if (!data.data) throw new Error('The API returned no data');
        return data.data;
    } catch (error) {
        // Retry on network errors or 500s, but not on auth errors
        if (error.name === 'AbortError' || options.signal?.aborted) throw error;
        if (retryCount < MAX_RETRIES && (retryable || error instanceof TypeError)) {
            await new Promise(resolve => setTimeout(resolve, 1000 * (retryCount + 1)));
            return fetchGraphQL(query, variables, retryCount + 1, options);
        }
        throw error;
    }
};
  // Query: Get user basic information
  const getUserInfo = async () => {
      const query = `
      query {
          user {
              id
              login
              firstName
              lastName
              email
              campus
              avatarUrl
              addressCity: attrs(path: "addressCity")
              addressCountry: attrs(path: "addressCountry")
              transactions(order_by: {amount: desc}, where: {type: {_eq: "level"}}, limit: 1) {
                  type
                  amount
              }
          }
      }
      `;
      return fetchGraphQL(query);
  };
// Query: Get user XP transactions
const getUserXP = async () => {
    const query = `
      {
        transaction(
            where: {type: {_eq: "xp"}, event: {object: {name: {_eq: "Module"}}}}
            order_by: {id: asc}
        ) {
            object{name}
            id
            amount
            createdAt
        }
    }
      `;
    return fetchGraphQL(query);
};


// Query: Get user audit ratio
const getUserAudits = async () => {
    const query = `
        query {
            up: transaction(where: {type: {_eq: "up"}}) {
                amount
                path
                createdAt
            }
            down: transaction(where: {type: {_eq: "down"}}) {
                amount
                path
                createdAt
            }
        }
    `;
    return fetchGraphQL(query);
};

// Query: Get user finished projects info
const getUserFinishedProjects = async () => {
    const query = `
        query {
            user {
                projectEx: transactions(
                    order_by: { createdAt: desc }
                    where: {
                        _and: [
                            { type: { _eq: "xp" } }
                            { progress: { isDone: { _eq: true } } }
                            { path: { _ilike: "%/bahrain/bh-module/%" } }
                            { object: { type: { _eq: "project" } } }
                        ]
                    }
                ) {
                    userLogin
                    type
                    amount
                    path
                    createdAt
                    object {
                        name
                        type
                    }
                }
            }
        }
    `;
    return fetchGraphQL(query);
};

const getSkillDetails = async (userId) => {
    const query = `
        query user($userId: Int!) {
    user: user_by_pk(id: $userId) {
      transactions (
        order_by: [{ type: desc }, { amount: desc }]
        distinct_on: [type]
        where: { userId: { _eq: $userId }, type: { _like: "skill_%" } },
      )
      { type, amount }
    }
  }
    `;
    return fetchGraphQL(query, { userId });
};

// Campus cohort and project activity queries.
async function getCohortPrograms(campus, signal) {
    if (!campus) throw new Error('Your account has no campus for cohort discovery.');
    const { event } = await fetchGraphQL(`
        query CohortPrograms($campus: String!) {
            event(where: {campus: {_eq: $campus}, object: {name: {_eq: "Module"}}},
                  order_by: {id: asc}, limit: 100) {
                id
                cohorts { id name }
            }
        }`, { campus }, 0, { signal });
    return event;
}

async function getCohortPeople(eventIds, signal) {
    if (!eventIds.length) return { people: [], complete: true };
    const people = [];
    while (people.length < PEOPLE_LIMIT) {
        const { event_user } = await fetchGraphQL(`
            query CohortPeople($events: [Int!]!, $limit: Int!, $offset: Int!) {
                event_user(where: {eventId: {_in: $events}}, order_by: {id: asc},
                           limit: $limit, offset: $offset) {
                    id eventId userId userLogin level userAuditRatio xp { amount }
                }
            }`, { events: eventIds, limit: PEOPLE_PAGE_SIZE, offset: people.length }, 0, { signal });
        people.push(...event_user);
        if (event_user.length < PEOPLE_PAGE_SIZE) return { people, complete: true };
    }
    return { people, complete: false };
}

async function getGroupActivity(where, offset, signal) {
    return fetchGraphQL(`
        query CohortGroups($where: group_bool_exp!, $offset: Int!, $limit: Int!) {
            rows: group(where: $where, order_by: [{updatedAt: desc}, {id: desc}],
                        offset: $offset, limit: $limit) {
                id eventId path status updatedAt captainId captainLogin
                object { name }
                members(where: {accepted: {_eq: true}}, order_by: {userId: asc}) {
                    userId userLogin
                }
            }
            total: group_aggregate(where: $where) { aggregate { count } }
        }`, { where, offset, limit: ACTIVITY_PAGE_SIZE }, 0, { signal });
}

async function getAuditActivity(where, offset, signal) {
    return fetchGraphQL(`
        query CohortAudits($where: audit_bool_exp!, $offset: Int!, $limit: Int!) {
            rows: audit(where: $where, order_by: [{createdAt: desc}, {id: desc}],
                        offset: $offset, limit: $limit) {
                id auditorId auditorLogin closureType endAt auditedAt closedAt
                group {
                    id eventId path object { name }
                    members(where: {accepted: {_eq: true}}, order_by: {userId: asc}) {
                        userId userLogin
                    }
                }
            }
            total: audit_aggregate(where: $where) { aggregate { count } }
        }`, { where, offset, limit: ACTIVITY_PAGE_SIZE }, 0, { signal });
}

async function getPendingAudits(userId) {
    return fetchGraphQL(`
        query PendingAudits($userId: Int!) {
            rows: audit(where: {auditorId: {_eq: $userId}, closedAt: {_is_null: true},
                        auditedAt: {_is_null: true}, closureType: {_is_null: true}},
                        order_by: [{endAt: asc_nulls_last}, {id: asc}], limit: 100) {
                id endAt version
                group { captainId captainLogin path object { name subject: attrs(path: "subject") }
                    members(where: {accepted: {_eq: true}}) { userId userLogin }
                }
            }
            total: audit_aggregate(where: {auditorId: {_eq: $userId}, closedAt: {_is_null: true},
                        auditedAt: {_is_null: true}, closureType: {_is_null: true}}) {
                aggregate { count }
            }
        }`, { userId });
}

async function getPersonalAuditCode(id, userId) {
    return fetchGraphQL(`
        query PersonalAuditCode($id: Int!, $userId: Int!) {
            audit(where: {id: {_eq: $id}, auditorId: {_eq: $userId}}, limit: 1) {
                private { code }
            }
        }`, { id, userId });
}

export {
    ACTIVITY_PAGE_SIZE,
    getCohortPrograms,
    getCohortPeople,
    getGroupActivity,
    getAuditActivity,
    getPendingAudits,
    getPersonalAuditCode,
    getUserInfo,
    getUserXP,
    getUserAudits,
    getUserFinishedProjects,
    getSkillDetails
};
