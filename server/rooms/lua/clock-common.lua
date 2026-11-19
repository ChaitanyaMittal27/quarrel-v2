-- Shared prelude, concatenated into read/start/submit/catchup at module load.
local deadlines = KEYS[#KEYS] -- The final key in every clock script.
-- All keys come from the caller. Production always uses Redis TIME; tests inject now via repo options.
local function clock_now(override)
  local time = redis.call('TIME')
  return tonumber(override) or (tonumber(time[1]) * 1000 + math.floor(tonumber(time[2]) / 1000))
end

local function clock_message(room, messages, ordinal, kind, slot, text, at)
  local id = redis.call('HINCRBY', room, 'messageSeq', 1)
  redis.call('RPUSH', messages, cjson.encode({id='m_' .. id, ordinal=ordinal, kind=kind, slot=slot, text=text, at=at}))
  redis.call('PEXPIREAT', messages, tonumber(redis.call('HGET', room, 'expiresAt')) + 86400000)
end

local function clock_turn(room, slot, at, remaining)
  redis.call('HSET', room, 'activeSlot', slot, 'deadline', at + remaining)
  redis.call('ZADD', deadlines, at + remaining, string.sub(room, 6))
  redis.call('HINCRBY', room, 'version', 1)
end

local function clock_open(room, messages, plan, ordinal, at)
  local subtopic = plan.subtopics[ordinal]
  redis.call('HSET', room, 'ordinal', ordinal, 'a.remainingMs', subtopic.secondsPerPlayer * 1000,
    'b.remainingMs', subtopic.secondsPerPlayer * 1000, 'a.arguments', 0, 'b.arguments', 0)
  clock_message(room, messages, ordinal, 'announcement', cjson.null, 'Subtopic ' .. ordinal .. ': ' .. subtopic.question, at)
  clock_turn(room, subtopic.openerSlot, at, subtopic.secondsPerPlayer * 1000)
end

local function clock_next(room, messages, at, other)
  local remaining = tonumber(redis.call('HGET', room, string.lower(other) .. '.remainingMs'))
  if remaining > 0 then clock_turn(room, other, at, remaining); return end
  local active = redis.call('HGET', room, 'activeSlot')
  remaining = tonumber(redis.call('HGET', room, string.lower(active) .. '.remainingMs'))
  if remaining > 0 then clock_turn(room, active, at, remaining); return end
  local plan = cjson.decode(redis.call('HGET', room, 'plan'))
  local ordinal = tonumber(redis.call('HGET', room, 'ordinal')) + 1
  if ordinal <= #plan.subtopics then clock_open(room, messages, plan, ordinal, at)
  else
    redis.call('HSET', room, 'phase', 'ended')
    redis.call('HDEL', room, 'deadline', 'activeSlot')
    redis.call('ZREM', deadlines, string.sub(room, 6))
    redis.call('HINCRBY', room, 'version', 1)
  end
end

-- Rules 4.6/4.12: every transition uses the previous deadline, even after a long outage.
local function clock_catchup(room, messages, now)
  local changed = false
  if redis.call('HGET', room, 'closed') == '1' then
    redis.call('HDEL', room, 'deadline', 'activeSlot')
    redis.call('ZREM', deadlines, string.sub(room, 6))
    return false
  end
  while redis.call('HGET', room, 'phase') == 'debate' do
    local deadline = tonumber(redis.call('HGET', room, 'deadline'))
    if not deadline or now < deadline then break end
    local active = redis.call('HGET', room, 'activeSlot')
    redis.call('HSET', room, string.lower(active) .. '.remainingMs', 0)
    clock_next(room, messages, deadline, active == 'A' and 'B' or 'A')
    changed = true
  end
  if redis.call('HGET', room, 'phase') ~= 'debate' then redis.call('ZREM', deadlines, string.sub(room, 6)) end
  return changed
end

local function clock_result(room, now, changed, status)
  return {status=status or 'OK', changed=changed, now=now,
    deadline=tonumber(redis.call('HGET', room, 'deadline')) or cjson.null}
end
