-- Claim and allowlist the public input atomically. Never return drafts, consultations or workText.
local room = KEYS[1]
local time = redis.call('TIME')
local now = tonumber(ARGV[5]) or (tonumber(time[1]) * 1000 + math.floor(tonumber(time[2]) / 1000))
if redis.call('EXISTS', room) == 0 or tonumber(redis.call('HGET', room, 'expiresAt')) <= now or redis.call('HGET', room, 'closed') == '1' then return cjson.encode({status='OK'}) end
if ARGV[6] and ARGV[6] ~= '' and redis.call('HGET', room, 'debateId') ~= ARGV[6] then return cjson.encode({status='OK'}) end
local kind = ARGV[1]
if redis.call('HGET', room, 'phase') ~= kind then return cjson.encode({status='OK'}) end
if kind == 'summary' then
  if redis.call('HGET', room, 'workId') ~= ARGV[3] or redis.call('HGET', room, 'ordinal') ~= ARGV[2] then return cjson.encode({status='OK'}) end
  redis.call('HSET', room, 'workClaimToken', ARGV[4])
else
  if redis.call('HGET', room, 'juryRound') ~= ARGV[2] or redis.call('HGET', room, 'juryStatus') ~= 'pending' then return cjson.encode({status='OK'}) end
  if tonumber(redis.call('HGET', room, 'juryAttempts') or '0') >= 3 then
    redis.call('HSET', room, 'juryStatus', 'retry_required', 'juryError', 'provider_unavailable')
    redis.call('HINCRBY', room, 'version', 1)
    return cjson.encode({status='OK', changed=true})
  end
  redis.call('HINCRBY', room, 'juryAttempts', 1)
  redis.call('HSET', room, 'juryClaimToken', ARGV[4])
end
local fields = {}
for _, field in ipairs({'theme', 'topic', 'durationSec', 'a.name', 'b.name', 'a.position', 'b.position', 'plan', 'ordinal', 'summaries', 'juryAttempts'}) do
  local value = redis.call('HGET', room, field)
  if value then fields[#fields + 1] = field; fields[#fields + 1] = value end
end
local result = {status='OK', fields=fields}
local messages = redis.call('LRANGE', KEYS[2], 0, -1)
if #messages > 0 then result.messages = messages end
return cjson.encode(result)
