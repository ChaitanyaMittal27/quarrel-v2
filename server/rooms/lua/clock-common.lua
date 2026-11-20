-- Shared prelude, concatenated into read/start/submit/catchup at module load.
local deadlines = KEYS[#KEYS] -- The final key in every clock script.
local summaryTimeout = tonumber(ARGV[#ARGV - 1]) or 30000
local summaryWorkId = ARGV[#ARGV]
-- All keys come from the caller. Production always uses Redis TIME; tests inject now via repo options.
local function clock_now(override)
  local time = redis.call('TIME')
  return tonumber(override) or (tonumber(time[1]) * 1000 + math.floor(tonumber(time[2]) / 1000))
end

local function clock_message(room, messages, ordinal, kind, slot, text, at, source)
  local id = redis.call('HINCRBY', room, 'messageSeq', 1)
  local label = kind == 'argument' and ('S' .. ordinal .. (slot == 'A' and '-P1L1M' or '-P2L2M') .. id)
    or kind == 'judge_summary' and ('S' .. ordinal .. '-J') or nil
  redis.call('RPUSH', messages, cjson.encode({id='m_' .. id, label=label, ordinal=ordinal, kind=kind, slot=slot, text=text, at=at, source=source}))
  redis.call('PEXPIREAT', messages, tonumber(redis.call('HGET', room, 'expiresAt')) + 86400000)
end

local function clock_turn(room, slot, at, remaining)
  redis.call('HSET', room, 'state', 'composing', 'activeSlot', slot, 'deadline', at + remaining)
  redis.call('ZADD', deadlines, at + remaining, string.sub(room, 6))
  redis.call('HINCRBY', room, 'version', 1)
end

local function clock_open(room, messages, plan, ordinal, at)
  local subtopic = plan.subtopics[ordinal]
  redis.call('HSET', room, 'ordinal', ordinal, 'a.remainingMs', subtopic.secondsPerPlayer * 1000,
    'b.remainingMs', subtopic.secondsPerPlayer * 1000, 'a.arguments', 0, 'b.arguments', 0, 'a.consults', 0, 'b.consults', 0)
  clock_message(room, messages, ordinal, 'announcement', cjson.null, 'Subtopic ' .. ordinal .. ': ' .. subtopic.question, at)
  clock_turn(room, subtopic.openerSlot, at, subtopic.secondsPerPlayer * 1000)
end

local function clock_next(room, messages, at, other, observedAt)
  local remaining = tonumber(redis.call('HGET', room, string.lower(other) .. '.remainingMs'))
  if remaining > 0 then clock_turn(room, other, at, remaining); return end
  local active = redis.call('HGET', room, 'activeSlot')
  remaining = tonumber(redis.call('HGET', room, string.lower(active) .. '.remainingMs'))
  if remaining > 0 then clock_turn(room, active, at, remaining); return end
  -- A fresh AI budget begins when exhaustion is observed, never at an old turn deadline.
  local deadline = (observedAt or at) + summaryTimeout
  redis.call('HSET', room, 'phase', 'summary', 'state', 'summary', 'workKind', 'summary',
    'workId', summaryWorkId, 'workOrdinal', redis.call('HGET', room, 'ordinal'), 'workDeadline', deadline)
  redis.call('HDEL', room, 'deadline', 'activeSlot', 'showUntil', 'workClaimToken')
  redis.call('ZADD', deadlines, deadline, string.sub(room, 6))
  redis.call('HINCRBY', room, 'version', 1)
end

-- A bounded, literal excerpt: never present a participant's claim as a verified finding.
local function summary_normalize(text)
  -- Match JS whitespace normalization, including Unicode separator characters.
  for _, value in ipairs({160, 5760, 8192, 8193, 8194, 8195, 8196, 8197, 8198, 8199, 8200, 8201, 8202, 8232, 8233, 8239, 8287, 12288, 65279}) do
    local utf = value < 2048 and string.char(192 + math.floor(value / 64), 128 + value % 64)
      or string.char(224 + math.floor(value / 4096), 128 + math.floor(value / 64) % 64, 128 + value % 64)
    text = string.gsub(text, utf, ' ')
  end
  text = string.gsub(text, '%s+', ' '):gsub('^ ', ''):gsub(' $', '')
  return text
end

local function summary_excerpt(text, wordLimit)
  text = summary_normalize(text)
  local words, excerpt = 0, ''
  for word in string.gmatch(text, '%S+') do
    if words >= wordLimit then break end
    excerpt = excerpt .. (words > 0 and ' ' or '') .. word
    words = words + 1
  end
  local count = 0
  for index = 1, #excerpt do
    local byte = string.byte(excerpt, index)
    if byte < 128 or byte >= 192 then
      count = count + 1
      if count > 230 then excerpt = string.sub(excerpt, 1, index - 1); break end
    end
  end
  -- Internal sentence punctuation is quoted, but a single sentence excerpt is clearer.
  excerpt = string.match(excerpt, '^(.-)[%.!?]%s') or excerpt
  excerpt = string.gsub(excerpt, '[%.!?]+$', '')
  return excerpt .. (excerpt ~= text and '...' or '')
end

local function summary_fallback(room, messages, ordinal)
  local last = {}
  for _, raw in ipairs(redis.call('LRANGE', messages, 0, -1)) do
    local message = cjson.decode(raw)
    if message.ordinal == ordinal and message.kind == 'argument' then last[message.slot] = message.text end
  end
  local parts = {}
  for _, slot in ipairs({'A', 'B'}) do
    local name = summary_normalize(redis.call('HGET', room, string.lower(slot) .. '.name') or slot)
    local nameWords = 0
    for _ in string.gmatch(name, '%S+') do nameWords = nameWords + 1 end
    parts[#parts + 1] = last[slot] and (name .. "'s unverified last public point: \"" .. summary_excerpt(last[slot], math.max(1, 23 - nameWords)) .. '\".')
      or (name .. ' made no public submission; claims remain unverified.')
  end
  return table.concat(parts, ' ')
end

local function summary_finish(room, messages, now, workId, text, source)
  if redis.call('HGET', room, 'phase') ~= 'summary' or redis.call('HGET', room, 'workId') ~= workId
    or redis.call('HGET', room, 'closed') == '1' then return false end
  local ordinal = tonumber(redis.call('HGET', room, 'ordinal'))
  local summaries = cjson.decode(redis.call('HGET', room, 'summaries') or '[]')
  summaries[#summaries + 1] = {ordinal=ordinal, text=text or summary_fallback(room, messages, ordinal), source=source or 'fallback', at=now}
  redis.call('HSET', room, 'summaries', cjson.encode(summaries), 'showUntil', now + 4000)
  clock_message(room, messages, ordinal, 'judge_summary', cjson.null, summaries[#summaries].text, now, summaries[#summaries].source)
  redis.call('HDEL', room, 'workId', 'workKind', 'workOrdinal', 'workDeadline', 'workClaimToken')
  redis.call('ZADD', deadlines, now + 4000, string.sub(room, 6))
  redis.call('HINCRBY', room, 'version', 1)
  return true
end

-- Both the worker and deadline recovery use this fenced finish path. Late results are no-ops.
local function clock_finish(room, messages, now, workId, text, source)
  if redis.call('HGET', room, 'phase') ~= 'debate' or redis.call('HGET', room, 'workId') ~= workId
    or redis.call('HGET', room, 'closed') == '1' then return false end
  local owner = redis.call('HGET', room, 'workOwner')
  local kind = redis.call('HGET', room, 'workKind')
  local raw = redis.call('HGET', room, 'workText')
  local ordinal = tonumber(redis.call('HGET', room, 'workOrdinal'))
  if not text then
    text = kind == 'argument' and raw or "Your lawyer couldn't answer this time."
    source = 'fallback'
  end
  local field = string.lower(owner) .. (kind == 'argument' and '.drafts' or '.consultations')
  local entries = cjson.decode(redis.call('HGET', room, field) or '[]')
  for _, entry in ipairs(entries) do
    if entry.id == workId then
      if kind == 'argument' then entry.status = 'complete'
      else entry.answer = text; entry.source = source end
    end
  end
  redis.call('HSET', room, field, cjson.encode(entries))
  redis.call('HDEL', room, 'workId', 'workKind', 'workOwner', 'workOrdinal', 'workText', 'workDeadline', 'workLawyerId')
  if kind == 'argument' then
    clock_message(room, messages, ordinal, 'argument', owner, text, now, source)
    clock_next(room, messages, now, owner == 'A' and 'B' or 'A')
  else
    clock_turn(room, owner, now, tonumber(redis.call('HGET', room, string.lower(owner) .. '.remainingMs')))
  end
  return true
end

-- Rules 4.6/4.12: every transition uses the previous deadline, even after a long outage.
local function clock_catchup(room, messages, now)
  local changed = false
  if redis.call('HEXISTS', room, 'debateId') == 0 then
    redis.call('HSET', room, 'debateId', 'd_' .. string.sub(summaryWorkId, 3))
    redis.call('HINCRBY', room, 'version', 1)
    changed = true
  end
  if redis.call('HGET', room, 'closed') == '1' then
    redis.call('HDEL', room, 'deadline', 'activeSlot')
    redis.call('ZREM', deadlines, string.sub(room, 6))
    return false
  end
  while true do
    local phase = redis.call('HGET', room, 'phase')
    if phase == 'summary' then
      local work = redis.call('HGET', room, 'workId')
      if work then
        if now < tonumber(redis.call('HGET', room, 'workDeadline')) then break end
        summary_finish(room, messages, now, work)
        changed = true
        break
      end
      local showUntil = tonumber(redis.call('HGET', room, 'showUntil'))
      if not showUntil or now < showUntil then break end
      local plan = cjson.decode(redis.call('HGET', room, 'plan'))
      local ordinal = tonumber(redis.call('HGET', room, 'ordinal')) + 1
      redis.call('HDEL', room, 'showUntil')
      if ordinal <= #plan.subtopics then
        redis.call('HSET', room, 'phase', 'debate')
        clock_open(room, messages, plan, ordinal, showUntil)
      else
        redis.call('HSET', room, 'phase', 'jury', 'state', 'jury', 'juryStatus', 'pending', 'juryRound', 1, 'juryAttempts', 0)
        redis.call('HINCRBY', room, 'version', 1)
        redis.call('ZREM', deadlines, string.sub(room, 6))
      end
      changed = true
    elseif phase ~= 'debate' then break
    else
    local work = redis.call('HGET', room, 'workId')
    if work then
      if now < tonumber(redis.call('HGET', room, 'workDeadline')) then break end
      clock_finish(room, messages, now, work)
      changed = true
    else
      local deadline = tonumber(redis.call('HGET', room, 'deadline'))
      if not deadline or now < deadline then break end
      local active = redis.call('HGET', room, 'activeSlot')
      redis.call('HSET', room, string.lower(active) .. '.remainingMs', 0)
      clock_next(room, messages, deadline, active == 'A' and 'B' or 'A', now)
      changed = true
    end
    end
  end
  local phase = redis.call('HGET', room, 'phase')
  if phase ~= 'debate' and phase ~= 'summary' then redis.call('ZREM', deadlines, string.sub(room, 6)) end
  return changed
end

local function clock_result(room, now, changed, status)
  local judge
  if redis.call('HGET', room, 'closed') ~= '1' then
    if redis.call('HGET', room, 'phase') == 'summary' and redis.call('HEXISTS', room, 'workId') == 1 then
      judge = {debateId=redis.call('HGET', room, 'debateId'), kind='summary', index=tonumber(redis.call('HGET', room, 'ordinal')), workId=redis.call('HGET', room, 'workId')}
    elseif redis.call('HGET', room, 'phase') == 'jury' and redis.call('HGET', room, 'juryStatus') == 'pending' then
      judge = {debateId=redis.call('HGET', room, 'debateId'), kind='jury', index=tonumber(redis.call('HGET', room, 'juryRound'))}
    end
  end
  return {status=status or 'OK', changed=changed, now=now, judge=judge,
    archiveId=redis.call('HGET', room, 'phase') == 'complete' and redis.call('HEXISTS', room, 'archivedAt') == 0 and redis.call('HGET', room, 'debateId') or nil,
    workId=redis.call('HGET', room, 'workId') or nil,
    deadline=tonumber(redis.call('HGET', room, 'deadline')) or cjson.null}
end
