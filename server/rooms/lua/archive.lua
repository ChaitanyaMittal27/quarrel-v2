-- KEYS: room, messages. ARGV: debate ID, archive timestamp or '' for read, test now.
local room = KEYS[1]
local time = redis.call('TIME')
local now = tonumber(ARGV[3]) or (tonumber(time[1]) * 1000 + math.floor(tonumber(time[2]) / 1000))
local frozen = redis.call('GET', KEYS[4])
if ARGV[2] == '' and frozen then return frozen end
if ARGV[2] ~= '' then
  redis.call('DEL', KEYS[4])
  redis.call('HDEL', KEYS[3], ARGV[1])
end
if redis.call('EXISTS', room) == 0 or redis.call('HGET', room, 'debateId') ~= ARGV[1]
  or redis.call('HGET', room, 'phase') ~= 'complete' then return cjson.encode({status='OK'}) end
if ARGV[2] ~= '' then
  if redis.call('HEXISTS', room, 'archivedAt') == 1 then return cjson.encode({status='OK', changed=false}) end
  redis.call('HSET', room, 'archivedAt', now)
  redis.call('HDEL', KEYS[3], ARGV[1])
  redis.call('HINCRBY', room, 'version', 1)
  return cjson.encode({status='OK', changed=true})
end
local fields = {}
for _, field in ipairs({'debateId','code','createdAt','debateCreatedAt','completedAt','theme','topic','durationSec',
  'a.position','b.position','a.name','b.name','a.player','b.player','summaries','verdict'}) do
  local value = redis.call('HGET', room, field)
  if value then fields[#fields + 1] = field; fields[#fields + 1] = value end
end
local result = {status='OK', fields=fields, now=now}
local messages = redis.call('LRANGE', KEYS[2], 0, -1)
if #messages > 0 then result.messages=messages end
-- Backfill old completed rooms on their first recovery read.
redis.call('SET', KEYS[4], cjson.encode(result))
redis.call('HSET', KEYS[3], ARGV[1], string.sub(room, 6))
return cjson.encode(result)
