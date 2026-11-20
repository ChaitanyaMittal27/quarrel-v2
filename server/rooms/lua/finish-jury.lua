-- KEYS: room, deadlines. ARGV: round, claim, verdict JSON or '', failure code or '', terminal flag, test now.
local room = KEYS[1]
local time = redis.call('TIME')
local now = tonumber(ARGV[7]) or (tonumber(time[1]) * 1000 + math.floor(tonumber(time[2]) / 1000))
if redis.call('EXISTS', room) == 0 or tonumber(redis.call('HGET', room, 'expiresAt')) <= now
  or redis.call('HGET', room, 'closed') == '1' or redis.call('HGET', room, 'phase') ~= 'jury'
  or redis.call('HGET', room, 'juryStatus') ~= 'pending' or redis.call('HGET', room, 'juryRound') ~= ARGV[1]
  or redis.call('HGET', room, 'juryClaimToken') ~= ARGV[2] then return cjson.encode({status='OK', changed=false}) end
if ARGV[3] ~= '' then
  local summaries = cjson.decode(redis.call('HGET', room, 'summaries') or '[]')
  local plan = cjson.decode(redis.call('HGET', room, 'plan'))
  if #summaries ~= #plan.subtopics then return cjson.encode({status='SUMMARIES_NOT_READY'}) end
  local verdict = cjson.decode(ARGV[3])
  for index, summary in ipairs(summaries) do
    if summary.ordinal ~= index then return cjson.encode({status='SUMMARIES_NOT_READY'}) end
  end
  verdict.subtopicSummaries = summaries
  -- Redis cjson represents an empty decoded array as {}; restore the two array slots.
  local encoded = string.gsub(string.gsub(cjson.encode(verdict), '"A":{}', '"A":[]'), '"B":{}', '"B":[]')
  redis.call('HSET', room, 'verdict', encoded, 'phase', 'complete', 'state', 'complete', 'completedAt', now)
  -- Immutable public outbox: a rematch or room TTL cannot destroy a pending archive.
  local fields = {}
  for _, field in ipairs({'debateId','createdAt','debateCreatedAt','completedAt','theme','topic','durationSec',
    'a.position','b.position','a.name','b.name','a.player','b.player','summaries','verdict'}) do
    local value = redis.call('HGET', room, field)
    if value then fields[#fields + 1] = field; fields[#fields + 1] = value end
  end
  local outbox = {status='OK', fields=fields, now=now}
  local messages = redis.call('LRANGE', KEYS[5], 0, -1)
  if #messages > 0 then outbox.messages = messages end
  redis.call('SET', KEYS[4], cjson.encode(outbox))
  redis.call('HSET', KEYS[3], redis.call('HGET', room, 'debateId'), string.sub(room, 6))
  redis.call('ZREM', KEYS[2], string.sub(room, 6))
elseif ARGV[6] == '1' then
  local allowed = {rate_limited=true, quota_exhausted=true, provider_unavailable=true, timeout=true,
    invalid_response=true, missing_configuration=true, demo_mode=true, unsafe_dispute=true}
  if not allowed[ARGV[5]] then return cjson.encode({status='INVALID_REQUEST'}) end
  redis.call('HSET', room, 'juryStatus', 'retry_required', 'juryError', ARGV[5])
else
  redis.call('HDEL', room, 'juryClaimToken')
  return cjson.encode({status='OK', changed=false})
end
redis.call('HDEL', room, 'juryClaimToken')
redis.call('HINCRBY', room, 'version', 1)
return cjson.encode({status='OK', changed=true, archiveId=redis.call('HGET', room, 'phase') == 'complete' and redis.call('HGET', room, 'debateId') or nil})
